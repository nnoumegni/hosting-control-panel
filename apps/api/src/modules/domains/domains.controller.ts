import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import type { DomainsService } from './domains.service.js';
import axios from 'axios';
import type { DnsService } from './dns.service.js';
import type { SSLService } from './ssl.service.js';
import type { SSMAgentService } from './ssm-agent.service.js';
import type { InstanceStatusService } from './instance-status.service.js';
import type { AgentHttpService } from './agent-http.service.js';
import { BadRequestError } from '../../shared/errors.js';
import { logger } from '../../core/logger/index.js';

export const createDomainsController = (
  service: DomainsService,
  dnsService: DnsService,
  sslService: SSLService,
  ssmAgentService: SSMAgentService,
  statusService: InstanceStatusService,
  agentHttpService: AgentHttpService,
) => ({
  getServerInfo: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    
    // Always fetch fresh data from agent HTTP API (fast, 1-2 seconds)
    // Pass agentHttpService to try agent API first
    // Also pass getInstancePublicIp function to get IP for placeholder response
    const getInstancePublicIp = instanceId ? ((instId: string) => service.getInstancePublicIpForPlaceholder(instId)) : undefined;
    
    const serverInfo = await service.getServerInfo(instanceId, agentHttpService, getInstancePublicIp);
    
    // Optionally update status in background (non-blocking) for other parts of the system
    if (instanceId) {
      void statusService.refreshStatus(instanceId).catch((error) => {
        logger.debug({ err: error, instanceId }, 'Failed to update status cache (non-critical)');
      });
    }
    
    res.json(serverInfo);
  }),

  getDomainQuota: asyncHandler(async (req: Request, res: Response) => {
    const { domain } = req.params as { domain: string };
    const { documentRoot, instanceId } = req.query as { documentRoot?: string; instanceId?: string };
    // Pass agentHttpService to try agent API first (much faster than SSM)
    const quota = await service.getDomainQuota(domain, documentRoot, instanceId, agentHttpService);
    res.json(quota);
  }),

  // DNS endpoints
  listHostedZones: asyncHandler(async (_req: Request, res: Response) => {
    const zones = await dnsService.listHostedZones();
    res.json({ zones });
  }),

  getDomainRecords: asyncHandler(async (req: Request, res: Response) => {
    const { domain } = req.params as { domain: string };
    const records = await dnsService.getDomainRecords(domain);
    if (!records) {
      // No hosted zone found in Route53 – fall back to public DNS info via external API
      // Use multiple parallel lookups (A, AAAA, MX, TXT, CNAME, NS, SOA) to enrich the Domain Info tab.
      const recordTypes = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SOA'];

      const lookups = await Promise.all(
        recordTypes.map(async (type) => {
          try {
            const response = await axios.get('https://api.jetcamer.com', {
              params: {
                action: 'getDomainInfo',
                domain,
                type,
                server: '',
              },
            });
            return { type, data: response.data };
          } catch {
            return { type, data: null };
          }
        }),
      );

      // Normalize into our ZoneRecords shape for the UI
      // Expected: { zoneId: string; zoneName: string; records: Array<{ name, type, ttl, values[] }> }
      type ExternalRecord = { name?: string; ttl?: number; class?: string; type?: string; data?: string };
      const normalizedRecords: Array<{ name: string; type: string; ttl?: number; values: string[] }> = [];

      for (const { data } of lookups) {
        if (!data || typeof data !== 'object') continue;
        const records: ExternalRecord[] = Array.isArray((data as any).records) ? (data as any).records : [];
        for (const rec of records) {
          const name = (rec.name || domain).replace(/\.$/, '');
          const rType = rec.type || 'A';
          const ttl = rec.ttl;
          if (rec.data == null) continue;

          // Clean value (strip surrounding quotes for TXT-like values)
          const raw = String(rec.data);
          const cleaned = raw.replace(/^"+|"+$/g, '');

          // Try to find an existing normalized record with same name/type/ttl to append value
          const existing = normalizedRecords.find((r) => r.name === name && r.type === rType && (r.ttl ?? null) === (ttl ?? null));
          if (existing) {
            if (!existing.values.includes(cleaned)) existing.values.push(cleaned);
          } else {
            normalizedRecords.push({
              name,
              type: rType,
              ttl,
              values: [cleaned],
            });
          }
        }
      }

      if (normalizedRecords.length > 0) {
        res.json({
          zoneId: 'public',
          zoneName: domain,
          records: normalizedRecords,
        });
        return;
      }

      res.status(404).json({ message: `No hosted zone found for domain: ${domain}` });
      return;
    }
    res.json(records);
  }),

  upsertDnsRecord: asyncHandler(async (req: Request, res: Response) => {
    const { zoneId } = req.params as { zoneId: string };
    const { name, type, ttl, values } = req.body as {
      name: string;
      type: string;
      ttl: number;
      values: string[];
    };

    if (!name || !type || !values || values.length === 0) {
      res.status(400).json({ message: 'Missing required fields: name, type, values' });
      return;
    }

    await dnsService.upsertRecord(zoneId, {
      name,
      type,
      ttl: ttl ?? 300,
      values,
    });
    res.json({ success: true, message: 'DNS record updated successfully' });
  }),

  deleteDnsRecord: asyncHandler(async (req: Request, res: Response) => {
    const { zoneId, recordName, recordType } = req.params as {
      zoneId: string;
      recordName: string;
      recordType: string;
    };

    await dnsService.deleteRecord(zoneId, recordName, recordType);
    res.json({ success: true, message: 'DNS record deleted successfully' });
  }),

  // SSL endpoints
  listCertificates: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { instanceId, domain } = req.query as { instanceId?: string; domain?: string };
      let certificates = await sslService.listCertificates(instanceId);
      // Optionally filter by domain (exact or wildcard match)
      if (domain) {
        const d = String(domain).toLowerCase();
        certificates = certificates.filter((c) => {
          const name = c.domain.toLowerCase();
          return name === d || name === `*.${d}` || d.endsWith(name.replace(/^\*\./, ''));
        });
      }
      res.json({ certificates });
    } catch (error: any) {
      const message = error?.message || 'Failed to list SSL certificates';
      // Map common causes to 400-level errors for clearer UI
      if (message.includes('AWS credentials not configured') || message.includes('EC2 instance ID not found')) {
        res.status(400).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  }),

  requestCertificate: asyncHandler(async (req: Request, res: Response) => {
    const { domain } = req.params as { domain: string };
    const { instanceId } = req.query as { instanceId?: string };
    const { email, wildcard, dnsChallenge, webroot } = req.body as {
      email?: string;
      wildcard?: boolean;
      dnsChallenge?: boolean;
      webroot?: string;
    };

    await sslService.requestCertificate(
      domain,
      { email, wildcard, dnsChallenge, webroot },
      instanceId,
    );
    res.json({ success: true, message: `SSL certificate request initiated for ${domain}` });
  }),

  renewAllCertificates: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    await sslService.renewAllCertificates(instanceId);
    res.json({ success: true, message: 'Certificate renewal initiated' });
  }),

  deleteCertificate: asyncHandler(async (req: Request, res: Response) => {
    const { domain } = req.params as { domain: string };
    const { instanceId } = req.query as { instanceId?: string };
    await sslService.deleteCertificate(domain, instanceId);
    res.json({ success: true, message: `Certificate for ${domain} deleted successfully` });
  }),

  // SSM Agent endpoints
  checkSSMAgentStatus: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const { forceRefresh } = req.query as { forceRefresh?: string };
    
    // Try to get from database first (unless force refresh is requested)
    if (!forceRefresh && instanceId) {
      const cachedStatus = await statusService.getStatus(instanceId, false);
      if (cachedStatus) {
        // Return cached SSM agent status
        res.json(cachedStatus.ssmAgent);
        
        // Update status in background (non-blocking)
        void statusService.refreshStatus(instanceId).catch((error) => {
          console.error('Failed to refresh status in background', error);
        });
        return;
      }
    }
    
    // Fetch fresh status
    const status = await ssmAgentService.checkAgentStatus(instanceId);
    
    // Save to database
    if (instanceId) {
      void statusService.updateStatusField(instanceId, 'ssmAgent', status).catch((error) => {
        console.error('Failed to save SSM agent status', error);
      });
    }
    
    res.json(status);
  }),

  installSSMAgent: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const result = await ssmAgentService.installAgent(instanceId);
    
    // Update status in database after installation command is sent
    if (instanceId) {
      void statusService.refreshStatus(instanceId).catch((error) => {
        console.error('Failed to update status after installing agent', error);
      });
    }
    
    res.json(result);
  }),

  startSSMAgent: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const result = await ssmAgentService.startAgent(instanceId);
    
    // Update status in database after start command
    if (instanceId) {
      void statusService.refreshStatus(instanceId).catch((error) => {
        console.error('Failed to update status after starting agent', error);
      });
    }
    
    res.json(result);
  }),

  checkInstallationStatus: asyncHandler(async (req: Request, res: Response) => {
    const { commandId } = req.params as { commandId: string };
    const { instanceId } = req.query as { instanceId?: string };
    const status = await ssmAgentService.checkInstallationStatus(commandId, instanceId);
    
    // If installation completed successfully, refresh status in database
    if (status.status === 'Success' && instanceId) {
      void statusService.refreshStatus(instanceId).catch((error) => {
        console.error('Failed to refresh status after installation', error);
      });
    }
    
    res.json(status);
  }),

  // Web Server installation endpoints
  installWebServer: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const {
      type,
      httpPort,
      httpsPort,
      phpVersion,
      extras,
      configureFirewall,
    } = req.body as {
      type: 'nginx' | 'apache';
      httpPort: number;
      httpsPort: number;
      phpVersion?: string;
      extras?: string;
      configureFirewall: boolean;
    };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    if (!type || !httpPort || !httpsPort) {
      res.status(400).json({ message: 'Missing required fields: type, httpPort, httpsPort' });
      return;
    }

    // Pass agentHttpService to use agent HTTP API instead of SSM
    const result = await service.installWebServer(
      {
        type,
        httpPort,
        httpsPort,
        phpVersion,
        extras,
        configureFirewall: configureFirewall ?? true,
      },
      instanceId,
      agentHttpService,
    );
    
    // Update status in database after installation starts
    if (instanceId) {
      void statusService.refreshStatus(instanceId).catch((error) => {
        console.error('Failed to update status after installation', error);
      });
    }
    
    res.json(result);
  }),

  checkWebServerInstallationStatus: asyncHandler(async (req: Request, res: Response) => {
    const { commandId } = req.params as { commandId: string };
    const { instanceId } = req.query as { instanceId?: string };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    // Use agent HTTP API instead of SSM
    const status = await agentHttpService.getWebServerInstallationStatus(instanceId, commandId);
    
    // If installation completed successfully, refresh status in database
    if (status.status === 'Success' && instanceId) {
      void statusService.refreshStatus(instanceId).catch((error) => {
        console.error('Failed to refresh status after web server installation', error);
      });
    }
    
    res.json(status);
  }),

  uninstallWebServer: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const { type } = req.body as { type: 'nginx' | 'apache' };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    if (!type) {
      res.status(400).json({ message: 'Missing required field: type' });
      return;
    }

    // Pass agentHttpService to use agent HTTP API instead of SSM
    const result = await service.uninstallWebServer(type, instanceId, agentHttpService);
    
    // Update status in database after uninstallation starts
    if (instanceId) {
      // Mark web server as none after uninstallation
      void statusService.updateStatusField(instanceId, 'webServer', {
        type: 'none',
        isRunning: false,
      }).catch((error) => {
        console.error('Failed to update status after uninstallation', error);
      });
    }
    
    res.json(result);
  }),

  checkWebServerUninstallationStatus: asyncHandler(async (req: Request, res: Response) => {
    const { commandId } = req.params as { commandId: string };
    const { instanceId } = req.query as { instanceId?: string };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    // Use agent HTTP API instead of SSM
    const status = await agentHttpService.getWebServerUninstallationStatus(instanceId, commandId);
    
    // If uninstallation completed successfully, refresh status in database
    if (status.status === 'Success' && instanceId) {
      void statusService.refreshStatus(instanceId).catch((error) => {
        console.error('Failed to refresh status after web server uninstallation', error);
      });
    }
    
    res.json(status);
  }),

  // Domain CRUD endpoints
  createDomain: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const { domain, documentRoot, sslEnabled } = req.body as {
      domain: string;
      documentRoot?: string;
      sslEnabled?: boolean;
    };

    if (!domain) {
      res.status(400).json({ message: 'Missing required field: domain' });
      return;
    }

    const result = await service.createDomain({
      domain,
      instanceId,
      documentRoot,
      sslEnabled,
    });

    res.status(201).json(result);
  }),

  listDomains: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    // Pass agentHttpService to get domains from instance in parallel with Route53
    const domains = await service.listDomains(instanceId, agentHttpService);
    res.json({ domains });
  }),

  getDomain: asyncHandler(async (req: Request, res: Response) => {
    const { idOrDomain } = req.params as { idOrDomain: string };
    const domain = await service.getDomain(idOrDomain);

    if (!domain) {
      res.status(404).json({ message: `Domain not found: ${idOrDomain}` });
      return;
    }

    res.json({ domain });
  }),

  updateDomain: asyncHandler(async (req: Request, res: Response) => {
    const { idOrDomain } = req.params as { idOrDomain: string };
    const { instanceId } = req.query as { instanceId?: string };
    const { documentRoot, sslEnabled, sslCertificatePath } = req.body as {
      documentRoot?: string;
      sslEnabled?: boolean;
      sslCertificatePath?: string;
    };

    const domain = await service.updateDomain(idOrDomain, {
      documentRoot,
      sslEnabled,
      sslCertificatePath,
    }, instanceId);

    if (!domain) {
      res.status(404).json({ message: `Domain not found: ${idOrDomain}` });
      return;
    }

    res.json({ domain });
  }),

  deleteDomain: asyncHandler(async (req: Request, res: Response) => {
    const { idOrDomain } = req.params as { idOrDomain: string };
    const result = await service.deleteDomain(idOrDomain);
    res.json({ success: true, message: `Domain ${idOrDomain} deleted successfully`, commandId: result.commandId });
  }),

  // FTP Server Management endpoints
  getFtpServerStatus: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const status = await agentHttpService.getFtpServerStatus(instanceId);
    res.json(status);
  }),

  installFtpServer: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const config = req.body as {
      port?: number;
      configureFirewall?: boolean;
      enableTLS?: boolean;
      passivePorts?: { min: number; max: number };
    };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    const result = await agentHttpService.installFtpServer(instanceId, config);
    res.json(result);
  }),

  getFtpInstallationStatus: asyncHandler(async (req: Request, res: Response) => {
    const { commandId } = req.params as { commandId: string };
    const { instanceId } = req.query as { instanceId?: string };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    const status = await agentHttpService.getFtpInstallationStatus(instanceId, commandId);
    res.json(status);
  }),

  uninstallFtpServer: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const { removeConfig } = req.body as { removeConfig?: boolean };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    const result = await agentHttpService.uninstallFtpServer(instanceId, removeConfig);
    res.json(result);
  }),

  // FTP Account Management endpoints
  listFtpAccounts: asyncHandler(async (req: Request, res: Response) => {
    const { domain } = req.query as { domain: string };
    const { instanceId } = req.query as { instanceId?: string };

    if (!domain) {
      throw new BadRequestError('domain is required');
    }

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    // Check if domain is hosted on instance - if not, return read-only data
    const isHosted = await agentHttpService.isDomainHostedOnInstance(domain, instanceId);
    if (!isHosted) {
      // Return empty list for read-only domains
      res.json({
        accounts: [],
        domain,
        serverType: 'vsftpd' as const,
        serverInstalled: false,
        serverRunning: false,
      });
      return;
    }

    const result = await agentHttpService.listFtpAccounts(instanceId, domain);
    res.json(result);
  }),

  getFtpAccount: asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params as { username: string };
    const { instanceId } = req.query as { instanceId?: string };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    // Extract domain from username (format: localUsername@domain)
    const domainMatch = username.match(/@(.+)$/);
    if (!domainMatch) {
      throw new BadRequestError('Invalid username format. Expected: localUsername@domain');
    }
    const domain = domainMatch[1];

    // Check if domain is hosted on instance
    const isHosted = await agentHttpService.isDomainHostedOnInstance(domain, instanceId);
    if (!isHosted) {
      throw new BadRequestError('Domain is not hosted on this instance. FTP operations are read-only for external domains.');
    }

    const result = await agentHttpService.getFtpAccount(instanceId, username);
    res.json(result);
  }),

  createFtpAccount: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const account = req.body as {
      localUsername: string;
      password: string;
      domain: string;
      homeDirectory?: string;
      uploadBandwidth?: number;
      downloadBandwidth?: number;
      maxConnections?: number;
      chroot?: boolean;
    };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    if (!account.domain) {
      throw new BadRequestError('domain is required');
    }

    // Check if domain is hosted on instance - enforce read-only for external domains
    const isHosted = await agentHttpService.isDomainHostedOnInstance(account.domain, instanceId);
    if (!isHosted) {
      throw new BadRequestError('Domain is not hosted on this instance. FTP operations are read-only for external domains.');
    }

    const result = await agentHttpService.createFtpAccount(instanceId, account);
    res.json(result);
  }),

  updateFtpAccount: asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params as { username: string };
    const { instanceId } = req.query as { instanceId?: string };
    const updates = req.body as {
      password?: string;
      homeDirectory?: string;
      enabled?: boolean;
      uploadBandwidth?: number;
      downloadBandwidth?: number;
    };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    // Extract domain from username
    const domainMatch = username.match(/@(.+)$/);
    if (!domainMatch) {
      throw new BadRequestError('Invalid username format. Expected: localUsername@domain');
    }
    const domain = domainMatch[1];

    // Check if domain is hosted on instance
    const isHosted = await agentHttpService.isDomainHostedOnInstance(domain, instanceId);
    if (!isHosted) {
      throw new BadRequestError('Domain is not hosted on this instance. FTP operations are read-only for external domains.');
    }

    const result = await agentHttpService.updateFtpAccount(instanceId, username, updates);
    res.json(result);
  }),

  deleteFtpAccount: asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params as { username: string };
    const { instanceId } = req.query as { instanceId?: string };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    // Extract domain from username
    const domainMatch = username.match(/@(.+)$/);
    if (!domainMatch) {
      throw new BadRequestError('Invalid username format. Expected: localUsername@domain');
    }
    const domain = domainMatch[1];

    // Check if domain is hosted on instance
    const isHosted = await agentHttpService.isDomainHostedOnInstance(domain, instanceId);
    if (!isHosted) {
      throw new BadRequestError('Domain is not hosted on this instance. FTP operations are read-only for external domains.');
    }

    const result = await agentHttpService.deleteFtpAccount(instanceId, username);
    res.json(result);
  }),

  testFtpAccount: asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params as { username: string };
    const { instanceId } = req.query as { instanceId?: string };
    const { password } = req.body as { password: string };

    if (!instanceId) {
      throw new BadRequestError('instanceId is required');
    }

    if (!password) {
      throw new BadRequestError('password is required');
    }

    // Extract domain from username
    const domainMatch = username.match(/@(.+)$/);
    if (!domainMatch) {
      throw new BadRequestError('Invalid username format. Expected: localUsername@domain');
    }
    const domain = domainMatch[1];

    // Check if domain is hosted on instance
    const isHosted = await agentHttpService.isDomainHostedOnInstance(domain, instanceId);
    if (!isHosted) {
      throw new BadRequestError('Domain is not hosted on this instance. FTP operations are read-only for external domains.');
    }

    const result = await agentHttpService.testFtpAccount(instanceId, username, password);
    res.json(result);
  }),
});

