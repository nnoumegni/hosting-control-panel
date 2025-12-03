import { createGatewayRouter } from './gateway.router.js';
import { GatewayService } from './gateway.service.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { GatewayAISettingsProvider } from './gateway-ai-settings-provider.js';
import { MongoGatewayAISettingsRepository } from './gateway-ai-settings.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createGatewayModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  // Create AI settings provider for credential storage and sync
  const aiSettingsRepository = new MongoGatewayAISettingsRepository();
  const aiSettingsProvider = new GatewayAISettingsProvider(
    aiSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const service = new GatewayService(serverSettingsProvider, aiSettingsProvider);

  return {
    router: createGatewayRouter(service),
  };
}

export type GatewayModule = Awaited<ReturnType<typeof createGatewayModule>>;

