import cors from 'cors';
import express, { type Request } from 'express';
import helmet from 'helmet';
import pinoHttpImport from 'pino-http';

import { env } from './config/env.js';
import { errorHandler } from './core/middleware/error-handler.js';
import { notFoundHandler } from './core/middleware/not-found.js';
import { requestId } from './core/middleware/request-id.js';
import { logger } from './core/logger/index.js';
import type { Server } from 'http';
import { createApiRouter } from './routes/index.js';

const pinoHttp = (pinoHttpImport as unknown as typeof import('pino-http')['default']);

export const createApp = async (httpServer?: Server) => {
  const app = express();

  app.set('trust proxy', 1);

  // Configure CORS before Helmet to avoid conflicts
  app.use(
    cors({
      origin: true, // Allow all origins
      credentials: true, // Allow credentials
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  );

  // Configure Helmet with CORS-friendly settings
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      quietReqLogger: env.NODE_ENV === 'test',
      customProps: (req: Request) => ({ requestId: req.id }),
    }),
  );

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const apiRouterResult = await createApiRouter(httpServer);
  app.use('/api', apiRouterResult.router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  // Initialize scheduler if domains module is available
  if (apiRouterResult.domainsModule?.statusService) {
    const { StatusRefreshScheduler } = await import('./core/scheduler/status-refresh-scheduler.js');
    const scheduler = new StatusRefreshScheduler(apiRouterResult.domainsModule.statusService);
    scheduler.start();
    logger.info('Status refresh scheduler initialized');
  }

  return app;
};
