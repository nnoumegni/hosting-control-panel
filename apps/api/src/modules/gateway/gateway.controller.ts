import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { BadRequestError } from '../../shared/errors.js';
import type { GatewayService } from './gateway.service.js';

export function createGatewayController(service: GatewayService) {
  return {
    getAISettings: asyncHandler(async (_req: Request, res: Response) => {
      const settings = await service.getAISettings();
      res.json(settings);
    }),

    updateAISettings: asyncHandler(async (req: Request, res: Response) => {
      const settings = await service.updateAISettings(req.body);
      res.json(settings);
    }),

    getServerSettings: asyncHandler(async (_req: Request, res: Response) => {
      const settings = await service.getServerSettings();
      res.json(settings);
    }),

    getStatus: asyncHandler(async (req: Request, res: Response) => {
      const { instanceId } = req.query as { instanceId?: string };
      if (!instanceId) {
        throw new BadRequestError('instanceId query parameter is required');
      }
      const status = await service.getStatus(instanceId);
      res.json(status);
    }),

    getRules: asyncHandler(async (req: Request, res: Response) => {
      const { instanceId } = req.query as { instanceId?: string };
      if (!instanceId) {
        throw new BadRequestError('instanceId query parameter is required');
      }
      const rules = await service.getRules(instanceId);
      res.json(rules);
    }),

    getStats: asyncHandler(async (req: Request, res: Response) => {
      const { instanceId } = req.query as { instanceId?: string };
      if (!instanceId) {
        throw new BadRequestError('instanceId query parameter is required');
      }
      const stats = await service.getStats(instanceId);
      res.json(stats);
    }),
  };
}
