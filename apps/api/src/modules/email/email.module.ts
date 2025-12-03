import { createEmailRouter } from './email.router.js';
import { EmailService } from './email.service.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createEmailModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const service = new EmailService(serverSettingsProvider);

  return {
    router: createEmailRouter(service),
  };
}

export type EmailModule = Awaited<ReturnType<typeof createEmailModule>>;

