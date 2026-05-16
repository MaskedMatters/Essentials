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
    user.dockerVncPassword  = null; // No longer needed for linuxserver/chromium
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

// ── Proxy Handler ─────────────────────────────────────────────────────────────

/**
 * Verifies the token from query, header, or cookie and returns the userId.
 */
async function verifyProxyToken(req: any): Promise<string> {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  let token = url.searchParams.get('token');

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(cookieHeader.split('; ').map((c: string) => {
      const parts = c.split('=');
      return [parts[0], parts.slice(1).join('=')];
    }));
    token = cookies.proxyToken;
  }

  if (!token) throw new Error('No token provided');

  const decoded: any = jwt.verify(token, JWT_SECRET);
  return decoded.userId;
}

// Single proxy instance to avoid memory leaks and handle WebSockets correctly.
export const containerProxy = createProxyMiddleware({
  target: 'http://placeholder', // overwritten by router
  router: async (req: any) => {
    try {
      const userId = await verifyProxyToken(req);
      const user = await User.findById(userId);
      if (!user?.dockerContainerId) return undefined;

      const ip = await CS.getContainerIp(user.dockerContainerId);
      return `http://${ip}:3000`;
    } catch (err) {
      console.error('[Proxy Router Error]:', err);
      return undefined;
    }
  },
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/api/containers/proxy': '' },
  on: {
    error: (err: any, req: any, res: any) => {
      console.error('[Proxy Error]:', err);
      if (res && res.writeHead) {
        res.writeHead(502);
        res.end('Container proxy error');
      }
    },
    proxyReq: (proxyReq: any, req: any, res: any) => {
      // If there's a token in the query, set it in a cookie for subsequent asset requests.
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      
      if (token && res && res.cookie) {
        res.cookie('proxyToken', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/api/containers/proxy',
          maxAge: 24 * 60 * 60 * 1000 // 1 day
        });
      }
    },
    proxyReqWs: (proxyReq: any, req: any, socket: any, options: any, head: any) => {
      // Potential logic for WS upgrades if needed
    }
  },
});

// Middleware for the /proxy route
router.use('/proxy', containerProxy);

export default router;
