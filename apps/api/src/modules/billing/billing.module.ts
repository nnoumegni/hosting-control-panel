import { createBillingRouter } from './billing.router.js';
import { BillingService } from './billing.service.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createBillingModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const service = new BillingService(serverSettingsProvider);

  return {
    router: createBillingRouter(service),
  };
}

export type BillingModule = Awaited<ReturnType<typeof createBillingModule>>;

