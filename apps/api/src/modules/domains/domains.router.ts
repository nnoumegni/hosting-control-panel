import { Router } from 'express';

import { createDomainsController } from './domains.controller.js';
import type { DomainsService } from './domains.service.js';
import type { DnsService } from './dns.service.js';
import type { SSLService } from './ssl.service.js';
import type { SSMAgentService } from './ssm-agent.service.js';
import type { InstanceStatusService } from './instance-status.service.js';
import type { AgentHttpService } from './agent-http.service.js';

export const createDomainsRouter = (
  service: DomainsService,
  dnsService: DnsService,
  sslService: SSLService,
  ssmAgentService: SSMAgentService,
  statusService: InstanceStatusService,
  agentHttpService: AgentHttpService,
) => {
  const router = Router();
  const controller = createDomainsController(service, dnsService, sslService, ssmAgentService, statusService, agentHttpService);

  // Server and domain info
  router.get('/server-info', controller.getServerInfo);
  router.get('/quota/:domain', controller.getDomainQuota);

  // DNS endpoints
  router.get('/dns/zones', controller.listHostedZones);
  router.get('/dns/zones/:zoneId', controller.getHostedZone);
  router.delete('/dns/zones/:zoneId', controller.deleteHostedZone);
  router.get('/dns/records/:domain', controller.getDomainRecords);
  router.post('/dns/zones/:zoneId/records', controller.upsertDnsRecord);
  router.delete('/dns/zones/:zoneId/records/:recordName/:recordType', controller.deleteDnsRecord);

  // SSL endpoints
  router.get('/ssl/certificates', controller.listCertificates);
  router.post('/ssl/certificates/:domain', controller.requestCertificate);
  router.post('/ssl/certificates/renew', controller.renewAllCertificates);
  router.delete('/ssl/certificates/:domain', controller.deleteCertificate);

  // SSM Agent endpoints
  router.get('/ssm-agent/status', controller.checkSSMAgentStatus);
  router.post('/ssm-agent/install', controller.installSSMAgent);
  router.post('/ssm-agent/start', controller.startSSMAgent);
  router.get('/ssm-agent/installation/:commandId', controller.checkInstallationStatus);

  // Web Server installation endpoints
  router.post('/web-server/install', controller.installWebServer);
  router.get('/web-server/installation/:commandId', controller.checkWebServerInstallationStatus);
  router.post('/web-server/uninstall', controller.uninstallWebServer);
  router.get('/web-server/uninstallation/:commandId', controller.checkWebServerUninstallationStatus);

  // Domain CRUD endpoints
  router.post('/domains', controller.createDomain);
  router.get('/domains', controller.listDomains);
  router.get('/domains/:idOrDomain', controller.getDomain);
  router.put('/domains/:idOrDomain', controller.updateDomain);
  router.delete('/domains/:idOrDomain', controller.deleteDomain);

  // FTP Server Management endpoints
  router.get('/ftp/server/status', controller.getFtpServerStatus);
  router.post('/ftp/server/install', controller.installFtpServer);
  router.get('/ftp/server/installation/:commandId', controller.getFtpInstallationStatus);
  router.post('/ftp/server/uninstall', controller.uninstallFtpServer);

  // FTP Account Management endpoints
  router.get('/ftp/accounts', controller.listFtpAccounts);
  router.get('/ftp/accounts/:username', controller.getFtpAccount);
  router.post('/ftp/accounts', controller.createFtpAccount);
  router.put('/ftp/accounts/:username', controller.updateFtpAccount);
  router.delete('/ftp/accounts/:username', controller.deleteFtpAccount);
  router.post('/ftp/accounts/:username/test', controller.testFtpAccount);

  return router;
};

