import { createRequire } from 'module';

import pino, { type TransportSingleOptions } from 'pino';

import { env } from '../../config/env.js';

let transport: TransportSingleOptions | undefined;

if (env.NODE_ENV === 'development') {
  try {
    const require = createRequire(import.meta.url);
    require.resolve('pino-pretty');
    transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('pino-pretty is not installed; falling back to JSON logs.', error);
  }
}

export const logger = pino({
  name: 'hosting-control-panel-api',
  level: env.LOG_LEVEL,
  transport,
});

export type Logger = typeof logger;
