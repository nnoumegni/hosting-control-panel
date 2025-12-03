/**
 * WebSocket HTTP controller for managing agents
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { WebSocketService } from './websocket.service.js';

export const createWebSocketController = (service: WebSocketService) => ({
  /**
   * Get list of connected agents
   */
  getConnectedAgents: asyncHandler(async (_req: Request, res: Response) => {
    const agents = service.getConnectedAgents();
    res.json({ agents });
  }),

  /**
   * Check if an agent is connected
   */
  checkAgentConnection: asyncHandler(async (req: Request, res: Response) => {
    const { agentId } = req.params;
    const isConnected = service.isAgentConnected(agentId);
    res.json({ agentId, connected: isConnected });
  }),

  /**
   * Send a command to an agent
   */
  sendCommand: asyncHandler(async (req: Request, res: Response) => {
    const { agentId } = req.params;
    const { command, args } = req.body as { command: string; args?: Record<string, string> };

    if (!command) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }

    const sent = await service.sendCommand(agentId, command, args);
    if (!sent) {
      res.status(404).json({ error: 'Agent not connected' });
      return;
    }

    res.json({ success: true, agentId, command });
  }),

});
