import { Router } from 'express';
import Log from '../models/Log';
import { LoggingService } from '../services/LoggingService';

const router = Router();

/**
 * GET /api/logs
 * Query params:
 * - service: filter by service name
 * - level: filter by log level
 * - limit: number of logs (default 100)
 */
router.get('/', async (req, res) => {
  try {
    const { service, level, limit = 100 } = req.query;
    
    const filter: any = {};
    if (service) filter.service = service;
    if (level) filter.level = level;

    const logs = await Log.find(filter)
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/logs
 * Allow frontend to send its own logs
 */
router.post('/', async (req, res) => {
  try {
    const { level, message, metadata } = req.body;
    const log = await LoggingService.addLog({
      service: 'frontend',
      level: level || 'info',
      message: message || '',
      metadata
    });
    res.status(201).json(log);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
