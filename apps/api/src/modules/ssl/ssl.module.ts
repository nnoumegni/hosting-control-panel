import { createSSLRouter } from './ssl.router.js';
import { SSLService } from './ssl.service.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createSSLModule() {
  // Create server settings provider for AWS credentials
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const service = new SSLService(serverSettingsProvider);

  return {
    router: createSSLRouter(service),
  };
}

export type SSLModule = Awaited<ReturnType<typeof createSSLModule>>;

