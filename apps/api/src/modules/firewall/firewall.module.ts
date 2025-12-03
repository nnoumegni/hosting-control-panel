import { logger } from '../../core/logger/index.js';
import { MongoFirewallRepository } from './firewall.mongo-repository.js';
import { createFirewallRouter } from './firewall.router.js';
import { FirewallService } from './firewall.service.js';
import { FirewallSyncService } from './firewall.sync-service.js';
import { FirewallVerificationService } from './firewall.verification-service.js';
import { MongoFirewallSettingsRepository } from './firewall.settings.mongo-repository.js';
import { FirewallSettingsProvider } from './firewall.settings-provider.js';
import { FirewallSettingsService } from './firewall.settings.service.js';
import { FirewallAutoConfigService } from './firewall.auto-config.js';
import { IamRoleSyncService } from './iam-role-sync.service.js';
import { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { MongoServerSettingsRepository } from '../server-settings/server-settings.mongo-repository.js';
import { DDoSProtectionService } from './ddos-protection.service.js';
import { MongoDDoSProtectionRepository } from './ddos-protection.mongo-repository.js';
import { env } from '../../config/env.js';

const VERIFICATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function createFirewallModule() {
  const repository = new MongoFirewallRepository();
  const settingsRepository = new MongoFirewallSettingsRepository();
  const settingsProvider = new FirewallSettingsProvider(
    settingsRepository,
    {
      securityGroupId: env.FIREWALL_SECURITY_GROUP_ID ?? null,
      networkAclId: env.FIREWALL_NETWORK_ACL_ID ?? null,
    },
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );
  const settingsService = new FirewallSettingsService(settingsProvider);
  
  // Create server settings provider for credential fallback
  const serverSettingsRepository = new MongoServerSettingsRepository();
  const serverSettingsProvider = new ServerSettingsProvider(
    serverSettingsRepository,
    env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null,
  );
  
  const syncService = new FirewallSyncService(settingsProvider, repository, serverSettingsProvider);
  const verificationService = new FirewallVerificationService(
    repository,
    settingsProvider,
    serverSettingsProvider,
  );
  
  // Create IAM role sync service
  const iamRoleSyncService = new IamRoleSyncService(serverSettingsProvider);
  
  const autoConfigService = new FirewallAutoConfigService(
    settingsProvider,
    serverSettingsProvider,
    iamRoleSyncService,
  );
  const service = new FirewallService(repository, syncService);
  
  // DDoS Protection Service
  const ddosProtectionRepository = new MongoDDoSProtectionRepository();
  const ddosProtectionService = new DDoSProtectionService(serverSettingsProvider, ddosProtectionRepository);

  // Auto-configure firewall settings on startup (discover Security Groups and Network ACLs)
  setTimeout(async () => {
    try {
      await autoConfigService.autoConfigure();
    } catch (error) {
      logger.error({ err: error }, 'Failed to auto-configure firewall settings on startup.');
    }
  }, 5000); // 5 seconds after module creation

  // Start periodic verification job
  let verificationInterval: NodeJS.Timeout | null = null;
  const startVerification = () => {
    if (verificationInterval) {
      clearInterval(verificationInterval);
    }
    verificationInterval = setInterval(async () => {
      try {
        await verificationService.verifyAllRules();
      } catch (error) {
        logger.error({ err: error }, 'Periodic firewall verification failed.');
      }
    }, VERIFICATION_INTERVAL_MS);
    logger.info({ intervalMs: VERIFICATION_INTERVAL_MS }, 'Started periodic firewall verification.');
  };

  // Start verification immediately and then periodically
  startVerification();
  // Run first verification after a short delay to let the server start
  setTimeout(async () => {
    try {
      await verificationService.verifyAllRules();
    } catch (error) {
      logger.error({ err: error }, 'Initial firewall verification failed.');
    }
  }, 10000); // 10 seconds after module creation

  return {
    router: createFirewallRouter(service, settingsService, verificationService, autoConfigService, ddosProtectionService),
    stopVerification: () => {
      if (verificationInterval) {
        clearInterval(verificationInterval);
        verificationInterval = null;
        logger.info('Stopped periodic firewall verification.');
      }
    },
    ddosProtectionService,
  };
}

export type FirewallModule = Awaited<ReturnType<typeof createFirewallModule>>;

