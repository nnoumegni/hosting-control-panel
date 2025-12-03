import { env } from '../../config/env.js';
import { MongoServerSettingsRepository } from './server-settings.mongo-repository.js';
import { ServerSettingsProvider } from './server-settings-provider.js';
import { ServerSettingsService } from './server-settings.service.js';
import { createServerSettingsRouter } from './server-settings.router.js';

export async function createServerSettingsModule() {
  const repository = new MongoServerSettingsRepository();
  const provider = new ServerSettingsProvider(repository, env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null);
  const service = new ServerSettingsService(provider);
  return createServerSettingsRouter(service);
}

export type ServerSettingsModule = Awaited<ReturnType<typeof createServerSettingsModule>>;

