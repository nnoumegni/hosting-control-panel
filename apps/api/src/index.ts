import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
import type { Server } from 'http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeMongoClient } from './config/mongo.js';
import { logger } from './core/logger/index.js';
import { initializeGeoIP, startGeoIPUpdater } from './shared/geoip/geoip.service.js';

const port = env.PORT;

async function startServer() {
  // Initialize GeoIP service
  await initializeGeoIP();
  startGeoIPUpdater();

  // Create HTTP or HTTPS server (needed for WebSocket)
  let server: Server;
  let isHttps = false;
  
  if (env.SSL_CERT_PATH && env.SSL_KEY_PATH) {
    // HTTPS mode - certificates are configured, use HTTPS
    try {
      const options: {
        cert: Buffer;
        key: Buffer;
        ca?: Buffer[];
      } = {
        cert: readFileSync(env.SSL_CERT_PATH),
        key: readFileSync(env.SSL_KEY_PATH),
      };

      // Optional: Certificate Authority chain
      if (env.SSL_CA_PATH) {
        options.ca = [readFileSync(env.SSL_CA_PATH)];
      }

      server = createHttpsServer(options);
      isHttps = true;
      logger.info({ certPath: env.SSL_CERT_PATH, keyPath: env.SSL_KEY_PATH }, 'Using HTTPS with SSL certificates');
    } catch (error) {
      logger.error({ error, certPath: env.SSL_CERT_PATH, keyPath: env.SSL_KEY_PATH }, 'Failed to load SSL certificates');
      throw new Error(`Failed to load SSL certificates: ${error instanceof Error ? error.message : String(error)}. HTTPS is required when SSL_CERT_PATH and SSL_KEY_PATH are configured.`);
    }
  } else {
    // HTTP mode - only if certificates are not configured
    logger.warn('⚠️  Running in HTTP mode. SSL certificates not configured. For production, configure SSL_CERT_PATH and SSL_KEY_PATH.');
    server = createHttpServer();
  }
  
  // Create app with server reference (for WebSocket setup)
  const app = await createApp(server);
  
  // Attach Express app to HTTP/HTTPS server
  server.on('request', app);

  server.listen(port, () => {
    const protocol = isHttps ? 'https' : 'http';
    const baseUrl = env.API_BASE_URL ?? `${protocol}://localhost:${port}`;
    logger.info({ baseUrl, protocol, port, https: isHttps }, 'API server started');
  });

  return server;
}

const server = await startServer();

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info({ signal }, 'Received shutdown signal');

  server.close((err?: Error) => {
    if (err) {
      logger.error({ err }, 'Error during server shutdown');
      process.exitCode = 1;
    }
    logger.info('Server closed');
    closeMongoClient()
      .then(() => {
        logger.info('MongoDB client closed');
        process.exit();
      })
      .catch((closeErr) => {
        logger.error({ err: closeErr }, 'Failed to close MongoDB client');
        process.exit(1);
      });
  });
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => void shutdown(signal as NodeJS.Signals));
});
