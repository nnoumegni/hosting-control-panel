import { Router } from 'express';
import type { Server } from 'http';
import { createAccountsModule } from '../modules/accounts/accounts.module.js';
import { createFirewallModule } from '../modules/firewall/firewall.module.js';
import { createAuthModule } from '../modules/auth/auth.module.js';
import { createServerSettingsModule } from '../modules/server-settings/server-settings.module.js';
import { createBillingModule } from '../modules/billing/billing.module.js';
import { createDomainsModule } from '../modules/domains/domains.module.js';
import { createEmailModule } from '../modules/email/email.module.js';
import { createMonitoringModule } from '../modules/monitoring/monitoring.module.js';
import { createDatabasesModule } from '../modules/databases/databases.module.js';
import { createSecurityAnalyticsModule } from '../modules/security/security-analytics.module.js';
import { createSSLModule } from '../modules/ssl/ssl.module.js';
import { createGatewayModule } from '../modules/gateway/gateway.module.js';
import { createMailProvidersModule } from '../modules/mail-providers/mail-providers.module.js';
import { healthRouter } from './health.js';

export async function createApiRouter(httpServer?: Server): Promise<{ 
  router: Router; 
  domainsModule: Awaited<ReturnType<typeof createDomainsModule>>;
  websocketModule?: Awaited<ReturnType<typeof import('../modules/websocket/websocket.module.js').createWebSocketModule>>;
}> {
  const router = Router();

  router.use('/health', healthRouter);

  const authRouter = await createAuthModule();
  router.use('/auth', authRouter);

  const accountsRouter = await createAccountsModule();
  router.use('/accounts', accountsRouter);

  const firewallModule = await createFirewallModule();
  router.use('/firewall', firewallModule.router);

  const serverSettingsRouter = await createServerSettingsModule();
  router.use('/settings/server', serverSettingsRouter);

  const billingModule = await createBillingModule();
  router.use('/billing', billingModule.router);

  const emailModule = await createEmailModule();
  router.use('/email', emailModule.router);

  const domainsModule = await createDomainsModule();
  router.use('/domains', domainsModule.router);

  // Create WebSocket module first if HTTP server is provided (needed for monitoring module)
  let websocketModule;
  if (httpServer) {
    // Get the server settings provider for WebSocket
    const { ServerSettingsProvider } = await import('../modules/server-settings/server-settings-provider.js');
    const { MongoServerSettingsRepository } = await import('../modules/server-settings/server-settings.mongo-repository.js');
    const { env } = await import('../config/env.js');
    const repository = new MongoServerSettingsRepository();
    const provider = new ServerSettingsProvider(repository, env.FIREWALL_CREDENTIAL_PASSPHRASE ?? null);
    
    const { createWebSocketModule } = await import('../modules/websocket/websocket.module.js');
    websocketModule = await createWebSocketModule(httpServer, provider);
    router.use('/websocket', websocketModule.router);
  }

  // Create monitoring module
  const monitoringModule = await createMonitoringModule();
  router.use('/monitoring', monitoringModule.router);

  const databasesModule = await createDatabasesModule();
  router.use('/databases', databasesModule.router);

  const securityAnalyticsModule = await createSecurityAnalyticsModule();
  router.use('/security', securityAnalyticsModule.router);

  const sslModule = await createSSLModule();
  router.use('/ssl', sslModule.router);

  const gatewayModule = await createGatewayModule();
  router.use('/gateway', gatewayModule.router);

  const mailProvidersModule = await createMailProvidersModule();
  router.use('/providers', mailProvidersModule.router);

  // Return both router and domains module for scheduler access
  return {
    router,
    domainsModule,
    websocketModule,
  };
}

// For backward compatibility, export a promise that resolves to the router
// This will be awaited in createApp
export const apiRouter = createApiRouter();
