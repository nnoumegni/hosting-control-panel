import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { logger } from '../../core/logger/index.js';
import { BadRequestError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { getEc2InstanceId } from '../../shared/aws/ec2-instance-detection.js';
import type { DnsService } from './dns.service.js';

const AGENT_API_PORT = 9811;

export interface FtpServerStatus {
  serverType: 'vsftpd' | 'none';
  installed: boolean;
  running: boolean;
  version?: string;
  port?: number;
  passivePorts?: {
    min: number;
    max: number;
  };
  configPath?: string;
}

export interface FtpInstallRequest {
  port?: number;
  configureFirewall?: boolean;
  enableTLS?: boolean;
  passivePorts?: {
    min: number;
    max: number;
  };
}

export interface FtpInstallResponse {
  commandId: string;
  status: string;
}

export interface InstallationStatus {
  status: 'InProgress' | 'Success' | 'Failed';
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface FtpAccount {
  username: string;
  localUsername: string;
  domain: string;
  homeDirectory: string;
  enabled: boolean;
  serverType: 'vsftpd';
  createdAt?: string;
  lastLogin?: string;
}

export interface FtpAccountListResponse {
  accounts: FtpAccount[];
  domain: string;
  serverType: 'vsftpd';
  serverInstalled: boolean;
  serverRunning: boolean;
}

export interface FtpAccountCreateRequest {
  localUsername: string;
  password: string;
  domain: string;
  homeDirectory?: string;
  uploadBandwidth?: number;
  downloadBandwidth?: number;
  maxConnections?: number;
  chroot?: boolean;
}

export interface FtpAccountCreateResponse {
  account: FtpAccount;
  commandId: string;
}

export interface FtpAccountUpdateRequest {
  password?: string;
  homeDirectory?: string;
  enabled?: boolean;
  uploadBandwidth?: number;
  downloadBandwidth?: number;
}

export interface FtpAccountTestRequest {
  password: string;
}

export interface FtpAccountTestResponse {
  success: boolean;
  message: string;
  connectionTime?: number;
  publicIp?: string;
  ftpPort?: number;
}

export class AgentHttpService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
    private readonly dnsService?: DnsService,
  ) {}

  /**
   * Resolve instance ID - try provided, then auto-detect
   */
  private async resolveInstanceId(instanceId?: string): Promise<string> {
    if (instanceId) return instanceId;
    
    try {
      const detected = await Promise.race([
        getEc2InstanceId(),
        new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      if (detected) return detected;
    } catch (error) {
      logger.debug({ err: error }, 'Failed to auto-detect EC2 instance ID');
    }

    throw new BadRequestError(
      'EC2 instance ID not found. Please provide an instance ID as a query parameter, ' +
      'or ensure this service is running on an EC2 instance with instance metadata available.',
    );
  }

  /**
   * Get EC2 instance public IP using EC2 API
   */
  private async getInstancePublicIp(instanceId: string): Promise<string | null> {
    try {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured');
      }

      const region = serverSettings.awsRegion ?? 'us-east-1';
      const ec2Client = new EC2Client({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });

      const response = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      const instance = response.Reservations?.[0]?.Instances?.[0];
      if (!instance) {
        logger.warn({ instanceId }, 'Instance not found in EC2');
        return null;
      }

      const publicIp = instance.PublicIpAddress || 
                       (instance.NetworkInterfaces?.[0]?.Association?.PublicIp) || null;

      if (publicIp) {
        logger.debug({ instanceId, publicIp }, 'Retrieved public IP from EC2 API');
        return publicIp;
      }

      logger.warn({ instanceId }, 'No public IP found for instance');
      return null;
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to get public IP from EC2 API');
      throw error;
    }
  }

  /**
   * Check if a domain is hosted on the instance by checking if its A record points to the instance IP
   */
  async isDomainHostedOnInstance(domain: string, instanceId?: string): Promise<boolean> {
    if (!this.dnsService) {
      logger.warn('DNS service not available, cannot check if domain is hosted');
      return false;
    }

    try {
      const targetInstanceId = await this.resolveInstanceId(instanceId);
      const instanceIp = await this.getInstancePublicIp(targetInstanceId);
      
      if (!instanceIp) {
        logger.warn({ instanceId: targetInstanceId }, 'Cannot determine instance IP, assuming domain is not hosted');
        return false;
      }

      // Get DNS records for the domain
      const records = await this.dnsService.getDomainRecords(domain);
      if (!records) {
        logger.debug({ domain }, 'No DNS records found for domain');
        return false;
      }

      // Check if any A record points to the instance IP
      const aRecords = records.records.filter(r => r.type === 'A');
      for (const record of aRecords) {
        if (record.values.includes(instanceIp)) {
          logger.debug({ domain, instanceIp, record: record.name }, 'Domain A record matches instance IP');
          return true;
        }
      }

      logger.debug({ domain, instanceIp, aRecords: aRecords.length }, 'No A record matches instance IP');
      return false;
    } catch (error) {
      logger.error({ err: error, domain, instanceId }, 'Failed to check if domain is hosted on instance');
      // On error, assume not hosted to be safe
      return false;
    }
  }

  /**
   * Make HTTP request to agent API
   */
  private async agentRequest<T>(
    instanceId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any,
  ): Promise<T> {
    const publicIp = await this.getInstancePublicIp(instanceId);
    if (!publicIp) {
      throw new Error('Could not determine public IP address for the instance');
    }

    const url = `http://${publicIp}:${AGENT_API_PORT}${endpoint}`;
    logger.debug({ instanceId, publicIp, url, method }, 'Making request to agent HTTP endpoint');

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000), // 30 seconds
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let errorData: { error?: string } | null = null;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as is
        }
        const errorMessage = errorData?.error || errorText || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json() as T;
      logger.debug({ instanceId, publicIp, endpoint }, 'Successfully received response from agent HTTP endpoint');
      return data;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error('Request to agent HTTP endpoint timed out');
      }
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Failed to fetch')) {
        throw new Error(`Could not connect to agent at ${url}. Make sure the agent is running and port ${AGENT_API_PORT} is accessible.`);
      }
      logger.error({ err: error, instanceId, publicIp, url }, 'Failed to make request to agent HTTP endpoint');
      throw error;
    }
  }

  // FTP Server Management

  async getFtpServerStatus(instanceId?: string): Promise<FtpServerStatus> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<FtpServerStatus>(targetInstanceId, 'GET', '/domains/ftp/server/status');
  }

  async installFtpServer(instanceId: string, config: FtpInstallRequest): Promise<FtpInstallResponse> {
    return this.agentRequest<FtpInstallResponse>(instanceId, 'POST', '/domains/ftp/server/install', config);
  }

  async getFtpInstallationStatus(instanceId: string, commandId: string): Promise<InstallationStatus> {
    return this.agentRequest<InstallationStatus>(instanceId, 'GET', `/domains/ftp/server/installation/${commandId}`);
  }

  async uninstallFtpServer(instanceId: string, removeConfig?: boolean): Promise<FtpInstallResponse> {
    return this.agentRequest<FtpInstallResponse>(instanceId, 'POST', '/domains/ftp/server/uninstall', { removeConfig });
  }

  // FTP Account Management

  async listFtpAccounts(instanceId: string, domain: string): Promise<FtpAccountListResponse> {
    return this.agentRequest<FtpAccountListResponse>(instanceId, 'GET', `/domains/ftp/accounts?domain=${encodeURIComponent(domain)}`);
  }

  async getFtpAccount(instanceId: string, username: string): Promise<{ account: FtpAccount }> {
    return this.agentRequest<{ account: FtpAccount }>(instanceId, 'GET', `/domains/ftp/accounts/${encodeURIComponent(username)}`);
  }

  async createFtpAccount(instanceId: string, account: FtpAccountCreateRequest): Promise<FtpAccountCreateResponse> {
    return this.agentRequest<FtpAccountCreateResponse>(instanceId, 'POST', '/domains/ftp/accounts', account);
  }

  async updateFtpAccount(instanceId: string, username: string, updates: FtpAccountUpdateRequest): Promise<{ account: FtpAccount; commandId: string }> {
    return this.agentRequest<{ account: FtpAccount; commandId: string }>(instanceId, 'PUT', `/domains/ftp/accounts/${encodeURIComponent(username)}`, updates);
  }

  async deleteFtpAccount(instanceId: string, username: string): Promise<{ success: boolean; message: string }> {
    return this.agentRequest<{ success: boolean; message: string }>(instanceId, 'DELETE', `/domains/ftp/accounts/${encodeURIComponent(username)}`);
  }

  async testFtpAccount(instanceId: string, username: string, password: string): Promise<FtpAccountTestResponse> {
    return this.agentRequest<FtpAccountTestResponse>(instanceId, 'POST', `/domains/ftp/accounts/${encodeURIComponent(username)}/test`, { password });
  }

  // Server Info endpoints (required)
  // These endpoints must be implemented by the agent - no SSM fallback

  async getServerInfo(instanceId?: string): Promise<{
    instanceId: string;
    webServer: {
      type: 'nginx' | 'apache' | 'none';
      version?: string;
      isRunning: boolean;
    };
    domains: Array<{
      domain: string;
      serverBlock: string;
      documentRoot?: string;
      sslEnabled: boolean;
      sslCertificate?: string;
      configPath: string;
    }>;
    publicIp?: string;
  }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    // Get server info from agent API - throws error if endpoint doesn't exist
    return await this.agentRequest(targetInstanceId, 'GET', '/domains/server-info');
  }

  async getDomainQuota(instanceId: string, domain: string, documentRoot?: string): Promise<{
    domain: string;
    used: number;
    limit?: number;
    percentage?: number;
  }> {
    const params = new URLSearchParams({ domain });
    if (documentRoot) {
      params.append('documentRoot', documentRoot);
    }
    // Get domain quota from agent API - throws error if endpoint doesn't exist
    return await this.agentRequest(instanceId, 'GET', `/domains/quota?${params.toString()}`);
  }

  // Web Server Management endpoints (required)

  async installWebServer(instanceId: string, config: {
    type: 'nginx' | 'apache';
    httpPort: number;
    httpsPort: number;
    phpVersion?: string;
    extras?: string;
    configureFirewall?: boolean;
  }): Promise<{ commandId: string; status: string }> {
    return this.agentRequest<{ commandId: string; status: string }>(instanceId, 'POST', '/domains/web-server/install', config);
  }

  async getWebServerInstallationStatus(instanceId: string, commandId: string): Promise<InstallationStatus> {
    return this.agentRequest<InstallationStatus>(instanceId, 'GET', `/domains/web-server/installation/${commandId}`);
  }

  async uninstallWebServer(instanceId: string, type: 'nginx' | 'apache', removeConfig?: boolean): Promise<{ commandId: string; status: string }> {
    return this.agentRequest<{ commandId: string; status: string }>(instanceId, 'POST', '/domains/web-server/uninstall', { type, removeConfig });
  }

  async getWebServerUninstallationStatus(instanceId: string, commandId: string): Promise<InstallationStatus> {
    return this.agentRequest<InstallationStatus>(instanceId, 'GET', `/domains/web-server/uninstallation/${commandId}`);
  }
}

