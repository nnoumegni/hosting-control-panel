/**
 * WebSocket server for dashboard clients (analytics, monitoring, etc.)
 */

import { WebSocketServer, type WebSocket as WSType } from 'ws';
import type { Server } from 'http';
import { logger } from '../../core/logger/index.js';
import type { WebSocketService } from './websocket.service.js';
import { randomUUID } from 'crypto';

export interface DashboardWebSocketServerOptions {
  path?: string;
  service: WebSocketService;
}

export function createDashboardWebSocketServer(
  httpServer: Server,
  options: DashboardWebSocketServerOptions,
): WebSocketServer {
  const { path = '/analytics-ws', service } = options;

  const wss = new WebSocketServer({
    server: httpServer,
    path,
  });

  wss.on('connection', (socket: WSType, req) => {
    const remoteAddress = req.socket.remoteAddress;
    const dashboardId = randomUUID();
    logger.info({ remoteAddress, path: req.url, dashboardId }, 'New dashboard WebSocket connection');

    // Extract instanceId from query params if provided
    const url = new URL(req.url || '', 'http://localhost');
    const instanceId = url.searchParams.get('instanceId');

    // Register dashboard
    service.registerDashboard(socket, dashboardId, instanceId);

    socket.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug({ dashboardId, message }, 'Received message from dashboard');
        
        // Handle dashboard messages if needed (e.g., subscribe to specific instance)
        if (message.type === 'subscribe' && message.instanceId) {
          // Update dashboard session with instanceId
          const session = (service as any).dashboards.get(dashboardId);
          if (session) {
            session.instanceId = message.instanceId;
          }
        }
      } catch (error) {
        logger.warn({ dashboardId, error }, 'Invalid message from dashboard');
      }
    });

    socket.on('close', (code, reason) => {
      logger.info(
        { remoteAddress, dashboardId, code, reason: reason.toString() },
        'Dashboard WebSocket connection closed',
      );
    });

    socket.on('error', (error) => {
      logger.error({ error, remoteAddress, dashboardId }, 'Dashboard WebSocket error');
    });
  });

  wss.on('error', (error) => {
    logger.error({ error }, 'Dashboard WebSocket server error');
  });

  logger.info({ path }, 'Dashboard WebSocket server initialized');

  return wss;
}

