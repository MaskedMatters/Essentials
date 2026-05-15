import express from 'express';
import { Issuer, generators } from 'openid-client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { SSOConfig } from '../models/SSOConfig';
import { User } from '../models/User';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev';

// ── Middleware ────────────────────────────────────────────────────────────────

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Requires admin privileges' });
    // @ts-ignore
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ── Helper ────────────────────────────────────────────────────────────────────

const buildClient = (config: any, host: string) => {
  const issuer = config._issuer as InstanceType<typeof Issuer>;
  return new issuer.Client({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uris: [`http://${host}/api/sso/callback`],
    response_types: ['code'],
  });
};

const resolveAdminStatus = (claims: Record<string, unknown>, config: any): boolean => {
  const groups = claims[config.groupClaimName];
  if (!groups) return false;
  if (Array.isArray(groups)) return groups.includes(config.adminGroupName);
  if (typeof groups === 'string') return groups === config.adminGroupName;
  return false;
};

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/sso/config — public; returns non-secret fields
router.get('/config', async (_req, res) => {
  try {
    const config = await SSOConfig.findOne();
    if (!config) return res.json({ enabled: false });

    res.json({
      enabled: config.enabled,
      autoLogin: config.autoLogin,
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      scopes: config.scopes,
      groupClaimName: config.groupClaimName,
      adminGroupName: config.adminGroupName,
      autoProvision: config.autoProvision,
    });
  } catch {
    res.status(500).json({ message: 'Error fetching SSO config' });
  }
});

// PUT /api/sso/config — admin only; upserts the SSO configuration
router.put('/config', requireAdmin, async (req, res) => {
  try {
    let config = await SSOConfig.findOne();
    if (!config) {
      config = new SSOConfig(req.body);
    } else {
      Object.assign(config, req.body);
    }
    await config.save();
    res.json({ message: 'SSO configuration updated successfully' });
  } catch {
    res.status(500).json({ message: 'Error updating SSO config' });
  }
});

// GET /api/sso/login — initiate the OIDC authorization code flow
router.get('/login', async (req, res) => {
  try {
    const config = await SSOConfig.findOne();
    if (!config?.enabled) return res.status(400).send('SSO is not enabled.');

    const issuer = await Issuer.discover(config.issuerUrl);
    const client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [`http://${req.headers.host}/api/sso/callback`],
      response_types: ['code'],
    });

    const nonce = generators.nonce();
    const state = generators.state();

    res.cookie('sso_state', state, { httpOnly: true, maxAge: 15 * 60 * 1000 });
    res.cookie('sso_nonce', nonce, { httpOnly: true, maxAge: 15 * 60 * 1000 });

    res.redirect(client.authorizationUrl({ scope: config.scopes, state, nonce }));
  } catch (err: any) {
    console.error('[SSO] Login initiation failed:', err.message);
    res.status(500).send('SSO login initialization failed.');
  }
});

// GET /api/sso/callback — handle the OIDC provider redirect
router.get('/callback', async (req, res) => {
  try {
    const config = await SSOConfig.findOne();
    if (!config?.enabled) return res.status(400).send('SSO is not enabled.');

    const issuer = await Issuer.discover(config.issuerUrl);
    const client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [`http://${req.headers.host}/api/sso/callback`],
      response_types: ['code'],
    });

    const params   = client.callbackParams(req);
    const state    = req.cookies['sso_state'];
    const nonce    = req.cookies['sso_nonce'];

    if (!state || !nonce) {
      return res.status(400).send('Missing SSO session cookies. Please try logging in again.');
    }

    const tokenSet = await client.callback(`http://${req.headers.host}/api/sso/callback`, params, { state, nonce });
    res.clearCookie('sso_state');
    res.clearCookie('sso_nonce');

    const claims   = tokenSet.claims();
    const username = (claims.preferred_username || claims.email) as string;

    if (!username) {
      return res.status(400).send('Provider did not return a preferred_username or email claim.');
    }

    let user = await User.findOne({ username });
    const isAdmin = config.groupClaimName ? resolveAdminStatus(claims as any, config) : false;

    if (!user) {
      if (!config.autoProvision) {
        return res.status(403).send('User does not exist and auto-provisioning is disabled.');
      }
      // Generate a random local password — the user authenticates exclusively via SSO
      const hashedPassword = await bcrypt.hash(generators.random() + 'A1!', 10);
      user = new User({ username, password: hashedPassword, isAdmin });
      await user.save();
    } else if (config.groupClaimName && user.isAdmin !== isAdmin) {
      // Keep admin status in sync with the provider's group claims
      user.isAdmin = isAdmin;
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
    );

    res.redirect(`/?sso_token=${token}`);
  } catch (err: any) {
    console.error('[SSO] Callback failed:', err.message);
    res.status(500).send(`SSO callback failed: ${err.message}`);
  }
});

export default router;
