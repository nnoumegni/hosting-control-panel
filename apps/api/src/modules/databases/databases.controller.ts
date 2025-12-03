import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { DatabasesService } from './databases.service.js';

export const createDatabasesController = (service: DatabasesService) => ({
  list: asyncHandler(async (_req: Request, res: Response) => {
    const data = await service.list();
    res.json(data);
  }),

  purchase: asyncHandler(async (req: Request, res: Response) => {
    const id = await service.purchase(req.body || {});
    res.status(201).json(id);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await service.update(id, req.body || {});
    res.json({ success: true });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await service.remove(id);
    res.json({ success: true });
  }),

  getCredentials: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const credentials = await service.getCredentials(id);
    if (!credentials) {
      res.status(404).json({ error: 'Credentials not found for this database' });
      return;
    }
    res.json(credentials);
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { password } = req.body as { password: string };
    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long' });
      return;
    }
    await service.resetPassword(id, password);
    res.json({ success: true });
  }),
});


