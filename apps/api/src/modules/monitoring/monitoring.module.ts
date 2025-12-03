import { MongoMonitoringRepository } from './monitoring.mongo-repository.js';
import { MonitoringService } from './monitoring.service.js';
import { createMonitoringRouter } from './monitoring.router.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { SSMAgentService } from './ssm-agent.service.js';
import { S3DataService } from './s3-data.service.js';
import { env } from '../../config/env.js';

export async function createMonitoringModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const repository = new MongoMonitoringRepository();
  const service = new MonitoringService(repository, serverSettingsProvider);
  const ssmAgentService = new SSMAgentService(serverSettingsProvider);
  const s3DataService = new S3DataService(serverSettingsProvider);

  return {
    router: createMonitoringRouter(service, ssmAgentService, s3DataService),
    service,
    ssmAgentService,
    s3DataService,
  };
}

export type MonitoringModule = Awaited<ReturnType<typeof createMonitoringModule>>;

