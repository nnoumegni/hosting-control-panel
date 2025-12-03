import { Router } from 'express';
import type { GatewayService } from './gateway.service.js';
import { createGatewayController } from './gateway.controller.js';

export const createGatewayRouter = (service: GatewayService) => {
  const router = Router();
  const controller = createGatewayController(service);

  router.get('/ai-settings', controller.getAISettings);
  router.put('/ai-settings', controller.updateAISettings);
  router.get('/server-settings', controller.getServerSettings);

  return router;
};
