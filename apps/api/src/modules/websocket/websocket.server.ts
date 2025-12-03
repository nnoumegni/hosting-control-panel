/**
 * WebSocket server setup
 */

import { WebSocketServer, type WebSocket as WSType } from 'ws';
import type { Server } from 'http';
import { logger } from '../../core/logger/index.js';
import { WebSocketService } from './websocket.service.js';

export interface WebSocketServerOptions {
  path?: string;
  service: WebSocketService;
}

export function createWebSocketServer(
  httpServer: Server,
  options: WebSocketServerOptions,
): WebSocketServer {
  const { path = '/agent', service } = options;

  const wss = new WebSocketServer({
    server: httpServer,
    path,
  });

  wss.on('connection', (socket: WSType, req) => {
    const remoteAddress = req.socket.remoteAddress;
    logger.info({ remoteAddress, path: req.url }, 'New WebSocket connection');

    let pendingAgentId: string | null = null;

    socket.on('message', async (data: Buffer) => {
      try {
        // Handle the message (verification, registration, etc.)
        // The service will verify signature first, then handle auth/registration
        await service.handleMessage(socket, data);
        
        // Track if we received a valid auth message
        try {
          const env = JSON.parse(data.toString()) as { agentId?: string; type?: string };
          if (env.type === 'auth' && env.agentId) {
            pendingAgentId = env.agentId;
          }
        } catch {
          // Ignore parse errors, already handled by service
        }
      } catch (error) {
        logger.error({ error, remoteAddress }, 'Error handling WebSocket message');
        socket.close(1011, 'internal_error');
      }
    });

    socket.on('close', (code, reason) => {
      logger.info(
        { remoteAddress, code, reason: reason.toString() },
        'WebSocket connection closed',
      );
    });

    socket.on('error', (error) => {
      logger.error({ error, remoteAddress }, 'WebSocket error');
    });

    // Handle authentication timeout
    const authTimeout = setTimeout(() => {
      if (!pendingAgentId) {
        logger.warn({ remoteAddress }, 'WebSocket connection timeout - no auth received');
        socket.close(1008, 'auth_timeout');
      }
    }, 30000); // 30 seconds

    socket.on('close', () => {
      clearTimeout(authTimeout);
    });
  });

  wss.on('error', (error) => {
    logger.error({ error }, 'WebSocket server error');
  });

  logger.info({ path }, 'WebSocket server initialized');

  return wss;
}

