import { Router } from 'express';
import os from 'os';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});
