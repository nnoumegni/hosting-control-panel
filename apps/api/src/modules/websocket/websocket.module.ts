/**
 * WebSocket module
 */

import type { Server } from 'http';
import type { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { WebSocketService } from './websocket.service.js';
import { AgentSecretsProvider } from './websocket.secrets-provider.js';
import { createWebSocketServer } from './websocket.server.js';
import { createDashboardWebSocketServer } from './websocket-dashboard.server.js';
import { createWebSocketRouter } from './websocket.router.js';
import type { Router } from 'express';
import type { WebSocketServer } from 'ws';

export interface WebSocketModule {
  service: WebSocketService;
  router: Router;
  wss: WebSocketServer;
  dashboardWss: WebSocketServer;
}

export async function createWebSocketModule(
  httpServer: Server,
  serverSettingsProvider: ServerSettingsProvider,
): Promise<WebSocketModule> {
  const secretsProvider = new AgentSecretsProvider(serverSettingsProvider);
  const service = new WebSocketService(secretsProvider);
  const router = createWebSocketRouter(service);
  const wss = createWebSocketServer(httpServer, {
    path: '/agent',
    service,
  });
  const dashboardWss = createDashboardWebSocketServer(httpServer, {
    path: '/analytics-ws',
    service,
  });

  return {
    service,
    router,
    wss,
    dashboardWss,
  };
}

