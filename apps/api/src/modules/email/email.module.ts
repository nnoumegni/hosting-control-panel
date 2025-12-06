import { createEmailRouter } from './email.router.js';
import { EmailService } from './email.service.js';
import { EmailSecurityService } from './email.security.service.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { MongoEmailSettingsRepository } from './email.settings.mongo-repository.js';
import { EmailSettingsService } from './email.settings.service.js';
import { env } from '../../config/env.js';

export async function createEmailModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const service = new EmailService(serverSettingsProvider);
  
  const emailSettingsRepository = new MongoEmailSettingsRepository();
  const settingsService = new EmailSettingsService(emailSettingsRepository);
  
  const securityService = new EmailSecurityService(serverSettingsProvider);

  return {
    router: createEmailRouter(service, settingsService, securityService),
  };
}

export type EmailModule = Awaited<ReturnType<typeof createEmailModule>>;

