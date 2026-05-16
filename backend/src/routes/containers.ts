import express from 'express';
import jwt from 'jsonwebtoken';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { User } from '../models/User';
import * as CS from '../services/ContainerService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev';

// ── Middleware ────────────────────────────────────────────────────────────────

const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    // @ts-ignore
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/containers/status
// Returns current container state for the authenticated user.
router.get('/status', requireAuth, async (req, res) => {
  try {
    // @ts-ignore
    const { userId } = req.user;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const status = await CS.getUserStatus(user.username, user.dockerContainerId ?? null);
    res.json({ status, containerId: user.dockerContainerId ?? null });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error fetching container status' });
  }
});

// POST /api/containers/create
// Creates and starts a new Chrome container for the user.
router.post('/create', requireAuth, async (req, res) => {
  try {
    // @ts-ignore
    const { userId } = req.user;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Enforce the 1-container limit
    const status = await CS.getUserStatus(user.username, user.dockerContainerId ?? null);
    if (status === 'running') {
      return res.status(400).json({ message: 'You already have an active container.' });
    }

    const { containerId } = await CS.createContainer(user.username);

    user.dockerContainerId  = containerId;
    user.dockerVncPassword  = 'password'; // Standardized
    await user.save();

    res.json({ message: 'Container started', containerId });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error creating container' });
  }
});

// POST /api/containers/stop
// Stops and removes the container; preserves the volume.
router.post('/stop', requireAuth, async (req, res) => {
  try {
    // @ts-ignore
    const { userId } = req.user;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.dockerContainerId) {
      await CS.stopContainer(user.dockerContainerId);
      user.dockerContainerId = null;
      user.dockerVncPassword = null;
      await user.save();
    }

    res.json({ message: 'Container stopped' });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error stopping container' });
  }
});

// DELETE /api/containers/volume
// Deletes the user's saved volume directory.
router.delete('/volume', requireAuth, async (req, res) => {
  try {
    // @ts-ignore
    const { userId, username } = req.user;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Safety: stop any running container first
    if (user.dockerContainerId) {
      await CS.stopContainer(user.dockerContainerId).catch(() => {});
      user.dockerContainerId = null;
      user.dockerVncPassword = null;
      await user.save();
    }

    await CS.deleteVolume(username);
    res.json({ message: 'Session deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error deleting volume' });
  }
});

// GET /api/containers/open
// Returns the proxy URL and VNC password so the frontend can auto-connect.
router.get('/open', requireAuth, async (req, res) => {
  try {
    // @ts-ignore
    const { userId } = req.user;
    const user = await User.findById(userId);
    if (!user?.dockerContainerId) {
      return res.status(404).json({ message: 'No active container' });
    }
    res.json({ vncPassword: user.dockerVncPassword });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Error' });
  }
});

// ALL /api/containers/proxy/*
// Reverse-proxies to the user's Chrome container's internal port 6901.
// Token is accepted via ?token= query param for iframe compatibility and persisted via cookie.
router.use('/proxy', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // 1. Extract token from query, Bearer header, or cookie
    let token = req.query.token as string;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      token = req.cookies.proxyToken;
    }

    if (!token) {
      return res.status(401).send('Unauthorized: No token provided');
    }

    // 2. Verify token
    let userId: string;
    try {
      // @ts-ignore
      ({ userId } = jwt.verify(token, JWT_SECRET) as any);
    } catch (err) {
      return res.status(401).send('Unauthorized: Invalid token');
    }

    // 3. Persist token in cookie if it was in query (for subsequent asset requests)
    if (req.query.token) {
      res.cookie('proxyToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/containers/proxy',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });
    }

    const user = await User.findById(userId);
    if (!user?.dockerContainerId) return res.status(404).send('No active container');

    const ip = await CS.getContainerIp(user.dockerContainerId);
    const target = `https://${ip}:6901`;

    // 4. Proxy to the container
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false, // Kasm uses self-signed certs
      ws: true,
      pathRewrite: { '^/api/containers/proxy': '' },
      // Provide Kasm's Basic Auth automatically to bypass the browser popup
      auth: 'kasm_user:password',
      on: {
        error: (err: any, _req: any, proxyRes: any) => {
          console.error('[Proxy Error]:', err);
          if (proxyRes.writeHead) {
            proxyRes.writeHead(502);
            proxyRes.end('Container proxy error');
          }
        },
      },
    })(req, res, next);
  } catch (err: any) {
    console.error('[Proxy Handler Error]:', err);
    res.status(500).send(err.message || 'Proxy error');
  }
});

export default router;
