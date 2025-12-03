/**
 * WebSocket HTTP routes
 */

import { Router } from 'express';
import { createWebSocketController } from './websocket.controller.js';
import type { WebSocketService } from './websocket.service.js';

export const createWebSocketRouter = (service: WebSocketService) => {
  const router = Router();
  const controller = createWebSocketController(service);

  router.get('/agents', controller.getConnectedAgents);
  router.get('/agents/:agentId', controller.checkAgentConnection);
  router.post('/agents/:agentId/command', controller.sendCommand);

  return router;
};

