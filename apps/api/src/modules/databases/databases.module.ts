import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';
import { DatabasesService } from './databases.service.js';
import { createDatabasesRouter } from './databases.router.js';
import { MongoDatabaseCredentialsRepository } from './database-credentials.mongo-repository.js';

export async function createDatabasesModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const credentialsRepository = new MongoDatabaseCredentialsRepository();

  const service = new DatabasesService(
    serverSettingsProvider,
    credentialsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  return {
    service,
    router: createDatabasesRouter(service),
  };
}

export type DatabasesModule = Awaited<ReturnType<typeof createDatabasesModule>>;


