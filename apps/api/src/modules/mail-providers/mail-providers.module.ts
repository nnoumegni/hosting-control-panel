import { createMailProvidersRouter } from './mail-providers.router.js';
import { MailProvidersService } from './mail-providers.service.js';
import { MongoMailProviderRepository } from './mail-providers.mongo-repository.js';
import { MongoDnsStatusRepository } from './dns-status.mongo-repository.js';
import { DnsDetectionService } from './dns-detection.service.js';
import { DnsValidationService } from './dns-validation.service.js';
import { GoogleWorkspaceService } from './google-workspace.service.js';
import { Microsoft365Service } from './microsoft365.service.js';
import { MongoDomainRepository } from '../domains/domain.mongo-repository.js';
import { env } from '../../config/env.js';

export async function createMailProvidersModule() {
  const mailProviderRepository = new MongoMailProviderRepository();
  const dnsStatusRepository = new MongoDnsStatusRepository();
  const domainRepository = new MongoDomainRepository();
  const dnsDetectionService = new DnsDetectionService();
  const dnsValidationService = new DnsValidationService();
  const googleWorkspaceService = new GoogleWorkspaceService();
  const microsoft365Service = new Microsoft365Service();

  // Use existing FIREWALL_CREDENTIAL_PASSPHRASE or require a new one
  const credentialPassphrase = env.FIREWALL_CREDENTIAL_PASSPHRASE;
  if (!credentialPassphrase) {
    throw new Error(
      'FIREWALL_CREDENTIAL_PASSPHRASE environment variable is required for email provider integration',
    );
  }

  const service = new MailProvidersService(
    mailProviderRepository,
    dnsStatusRepository,
    domainRepository,
    dnsDetectionService,
    dnsValidationService,
    googleWorkspaceService,
    microsoft365Service,
    credentialPassphrase,
  );

  return {
    router: createMailProvidersRouter(service),
  };
}

export type MailProvidersModule = Awaited<ReturnType<typeof createMailProvidersModule>>;

