import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';
import { DNSService } from './dns.service.js';
import { createDNSRouter } from './dns.router.js';

export async function createDNSModule() {
  const repository = new MongoServerSettingsRepository();
  const provider = new ServerSettingsProvider(repository, env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null);
  const service = new DNSService(provider);
  const router = createDNSRouter(service);

  return { router, service };
}

