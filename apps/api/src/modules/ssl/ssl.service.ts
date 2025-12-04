import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { getEc2InstanceId } from '../../shared/aws/ec2-instance-detection.js';

const AGENT_API_PORT = 9811;

export interface SSLCertificate {
  domain: string;
  issuedAt: string;
  expiresAt: string;
  issuer: string;
  status: 'active' | 'expired' | 'pending' | 'renewing' | 'revoked' | 'failed';
  webServer: string;
  managedBy: 'jetcamer' | 'external' | 'unknown';
  acmeEnvironment?: string;
  acmeAccountEmail?: string;
  lastRenewalAttempt?: string;
  autoRenewEnabled?: boolean;
  challengeType?: 'http' | 'dns';
  sans?: string[];
}

export interface SSLCertificateHealth extends SSLCertificate {
  daysToExpiry: number;
}

export interface ACMEAccount {
  email: string;
  environment: 'production' | 'staging';
  configured: boolean;
}

export interface DomainCheck {
  domain: string;
  ips: string[];
  error?: string;
}

export class SSLService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
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

    throw new Error(
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
   * Make request to agent HTTP API
   */
  private async agentRequest<T>(
    instanceId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const publicIp = await this.getInstancePublicIp(instanceId);
    if (!publicIp) {
      throw new Error('Could not determine public IP address for the instance');
    }

    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }

    const queryString = queryParams.toString();
    const url = `http://${publicIp}:${AGENT_API_PORT}${endpoint}${queryString ? `?${queryString}` : ''}`;
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
        let errorData: any = null;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as is
          errorData = { error: errorText, message: errorText };
        }
        
        // Preserve structured error response from agent (as per documentation)
        const structuredError: any = new Error(errorData?.message || errorData?.error || errorText || `HTTP ${response.status}`);
        structuredError.statusCode = response.status;
        structuredError.error = errorData?.error;
        structuredError.message = errorData?.message || errorData?.error || errorText;
        structuredError.action = errorData?.action;
        structuredError.details = errorData?.details;
        structuredError.rawError = errorData?.rawError;
        structuredError.response = errorData;
        throw structuredError;
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

  /**
   * List all SSL certificates with optional domain filter
   */
  async listCertificates(instanceId?: string, domain?: string): Promise<SSLCertificate[]> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    const params = domain ? { domain } : undefined;
    return this.agentRequest<SSLCertificate[]>(
      targetInstanceId,
      'GET',
      '/agent/ssl',
      undefined,
      params,
    );
  }

  /**
   * Get certificate health status
   */
  async getCertificateHealth(instanceId?: string, domain?: string): Promise<{ timestamp: string; items: SSLCertificateHealth[] }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    const params = domain ? { domain } : undefined;
    return this.agentRequest<{ timestamp: string; items: SSLCertificateHealth[] }>(
      targetInstanceId,
      'GET',
      '/agent/ssl/health',
      undefined,
      params,
    );
  }

  /**
   * Issue a new SSL certificate
   */
  async issueCertificate(instanceId: string | undefined, domain: string): Promise<SSLCertificate> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<SSLCertificate>(
      targetInstanceId,
      'POST',
      '/agent/ssl/issue',
      { domain },
    );
  }

  /**
   * Renew an existing SSL certificate
   */
  async renewCertificate(instanceId: string | undefined, domain: string): Promise<SSLCertificate> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<SSLCertificate>(
      targetInstanceId,
      'POST',
      '/agent/ssl/renew',
      { domain },
    );
  }

  /**
   * Revoke an SSL certificate
   */
  async revokeCertificate(instanceId: string | undefined, domain: string): Promise<{ status: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<{ status: string }>(
      targetInstanceId,
      'DELETE',
      '/agent/ssl/revoke',
      { domain },
    );
  }

  /**
   * Get ACME account configuration
   */
  async getACMEAccount(instanceId?: string): Promise<ACMEAccount> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<ACMEAccount>(
      targetInstanceId,
      'GET',
      '/agent/ssl/acme-account',
    );
  }

  /**
   * Configure ACME account
   */
  async configureACMEAccount(instanceId: string | undefined, email: string, useStaging: boolean = false): Promise<ACMEAccount> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<ACMEAccount>(
      targetInstanceId,
      'POST',
      '/agent/ssl/acme-account',
      { email, useStaging },
    );
  }

  /**
   * Check domain DNS resolution
   */
  async checkDomain(instanceId: string | undefined, domain: string): Promise<DomainCheck> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<DomainCheck>(
      targetInstanceId,
      'GET',
      '/agent/ssl/check-domain',
      undefined,
      { domain },
    );
  }

  /**
   * Download certificate bundle
   */
  async downloadCertificate(
    instanceId: string | undefined,
    domain: string,
    format: 'json' | 'pem' | 'zip' = 'json',
  ): Promise<any> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<any>(
      targetInstanceId,
      'GET',
      '/agent/ssl/download',
      undefined,
      { domain, format },
    );
  }

  /**
   * Get auto-renewal status
   */
  async getAutoRenewalStatus(instanceId?: string): Promise<{
    enabled: boolean;
    running: boolean;
    checkInterval: string;
    renewalThreshold: number;
    maxRetries: number;
  }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<{
      enabled: boolean;
      running: boolean;
      checkInterval: string;
      renewalThreshold: number;
      maxRetries: number;
    }>(
      targetInstanceId,
      'GET',
      '/agent/ssl/auto-renewal/status',
    );
  }

  /**
   * Trigger auto-renewal check manually
   */
  async triggerAutoRenewal(instanceId?: string): Promise<{ status: string; message: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<{ status: string; message: string }>(
      targetInstanceId,
      'POST',
      '/agent/ssl/auto-renewal/trigger',
    );
  }

  /**
   * Issue certificate with advanced options (DNS-01, wildcard, etc.)
   */
  async issueCertificateAdvanced(
    instanceId: string | undefined,
    config: {
      domain: string;
      altNames?: string[];
      challengeType?: 'http' | 'dns';
      dnsProvider?: {
        provider: 'webhook' | 'route53' | 'cloudflare';
        credentials: Record<string, string>;
      };
    },
  ): Promise<SSLCertificate> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<SSLCertificate>(
      targetInstanceId,
      'POST',
      '/agent/ssl/issue',
      config,
    );
  }

  /**
   * Renew certificate with advanced options
   */
  async renewCertificateAdvanced(
    instanceId: string | undefined,
    config: {
      domain: string;
      challengeType?: 'http' | 'dns';
      dnsProvider?: {
        provider: 'webhook' | 'route53' | 'cloudflare';
        credentials: Record<string, string>;
      };
    },
  ): Promise<SSLCertificate> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<SSLCertificate>(
      targetInstanceId,
      'POST',
      '/agent/ssl/renew',
      config,
    );
  }
}

