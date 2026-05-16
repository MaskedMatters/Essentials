import express from 'express';
import jwt from 'jsonwebtoken';
import { DockerService } from '../services/DockerService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev';

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

/**
 * GET /api/docker/containers
 * List all containers with basic info.
 */
router.get('/containers', requireAdmin, async (req, res) => {
  try {
    const containers = await DockerService.listAllContainers();
    res.json(containers);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/docker/containers/:id/stats
 * Get real-time stats for a container.
 */
router.get('/containers/:id/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await DockerService.getContainerStats(req.params.id as string);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/docker/containers/:id/action
 * Perform an action (start, stop, etc.)
 */
router.post('/containers/:id/action', requireAdmin, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['start', 'stop', 'restart', 'kill', 'remove'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }
    await DockerService.performAction(req.params.id as string, action);
    res.json({ message: `Container ${action}ed successfully` });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/docker/workspaces
 * List all saved workspace volumes.
 */
router.get('/workspaces', requireAdmin, async (req, res) => {
  try {
    const workspaces = await DockerService.listSavedWorkspaces();
    res.json(workspaces);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/docker/workspaces/:username
 * Delete a workspace volume.
 */
router.delete('/workspaces/:username', requireAdmin, async (req, res) => {
  try {
    await DockerService.deleteWorkspaceVolume(req.params.username as string);
    res.json({ message: 'Workspace volume deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
