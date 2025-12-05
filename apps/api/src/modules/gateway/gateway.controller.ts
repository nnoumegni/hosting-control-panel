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

    // Gateway Requirements endpoints
    checkAllRequirements: asyncHandler(async (req: Request, res: Response) => {
      const { instanceId } = req.query as { instanceId?: string };
      if (!instanceId) {
        throw new BadRequestError('instanceId query parameter is required');
      }
      const report = await service.checkAllRequirements(instanceId);
      res.json(report);
    }),

    installAllRequirements: asyncHandler(async (req: Request, res: Response) => {
      const { instanceId } = req.query as { instanceId?: string };
      const body = req.body as { install?: boolean; key?: string };
      if (!instanceId) {
        throw new BadRequestError('instanceId query parameter is required');
      }
      
      // If key is provided, it's an individual requirement operation
      if (body.key) {
        if (body.install) {
          // Install individual requirement
          const report = await service.installRequirement(instanceId, body.key);
          res.json(report);
        } else {
          // Check individual requirement
          const report = await service.checkRequirement(instanceId, body.key);
          res.json(report);
        }
      } else {
        // Install all requirements
        const report = await service.installAllRequirements(instanceId);
        res.json(report);
      }
    }),
  };
}
