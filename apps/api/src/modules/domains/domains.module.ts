import { createDomainsRouter } from './domains.router.js';
import { DomainsService } from './domains.service.js';
import { DnsService } from './dns.service.js';
import { SSLService } from './ssl.service.js';
import { SSMAgentService } from './ssm-agent.service.js';
import { InstanceStatusService } from './instance-status.service.js';
import { AgentHttpService } from './agent-http.service.js';
import { MongoInstanceStatusRepository } from './instance-status.mongo-repository.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createDomainsModule() {
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );

  const statusRepository = new MongoInstanceStatusRepository();
  const dnsService = new DnsService(serverSettingsProvider);
  const service = new DomainsService(serverSettingsProvider, dnsService);
  const sslService = new SSLService(serverSettingsProvider);
  const ssmAgentService = new SSMAgentService(serverSettingsProvider);
  const statusService = new InstanceStatusService(statusRepository, service, ssmAgentService);
  const agentHttpService = new AgentHttpService(serverSettingsProvider, dnsService);

  return {
    router: createDomainsRouter(service, dnsService, sslService, ssmAgentService, statusService, agentHttpService),
    statusService,
  };
}

export type DomainsModule = Awaited<ReturnType<typeof createDomainsModule>>;

