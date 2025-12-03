import { createSecurityAnalyticsRouter } from './security-analytics.router.js';
import { SecurityAnalyticsService } from './security-analytics.service.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createSecurityAnalyticsModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const service = new SecurityAnalyticsService(serverSettingsProvider);

  return {
    router: createSecurityAnalyticsRouter(service),
  };
}

export type SecurityAnalyticsModule = Awaited<ReturnType<typeof createSecurityAnalyticsModule>>;

