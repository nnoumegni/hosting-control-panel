import { IAMPermissionsService } from './iam-permissions.service.js';
import { createIAMPermissionsRouter } from './iam-permissions.router.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createIAMModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const permissionsService = new IAMPermissionsService(serverSettingsProvider);
  const router = createIAMPermissionsRouter(permissionsService);

  return {
    router,
    permissionsService,
  };
}

export type IAMModule = Awaited<ReturnType<typeof createIAMModule>>;

