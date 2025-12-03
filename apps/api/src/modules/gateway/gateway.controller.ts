import type { Request, Response } from 'express';
import type { GatewayService } from './gateway.service.js';

export function createGatewayController(service: GatewayService) {
  return {
    async getAISettings(_req: Request, res: Response) {
      const settings = await service.getAISettings();
      res.json(settings);
    },

    async updateAISettings(req: Request, res: Response) {
      const settings = await service.updateAISettings(req.body);
      res.json(settings);
    },

    async getServerSettings(_req: Request, res: Response) {
      const settings = await service.getServerSettings();
      res.json(settings);
    },
  };
}
