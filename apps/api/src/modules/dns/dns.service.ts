import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { getEc2InstanceId } from '../../shared/aws/ec2-instance-detection.js';

const AGENT_API_PORT = 9811;

export type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA' | 'SRV' | 'PTR' | 'ANY';

export interface DNSRecord {
  type: string;
  value: string;
  priority?: number;
  ttl?: number;
}

export interface DNSLookupResponse {
  hostname: string;
  recordType: string;
  records: DNSRecord[];
  count: number;
  cachedFrom?: string;
}

export interface DNSErrorResponse {
  error: string;
  hostname: string;
  type: string;
}

export class DNSService {
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
      return publicIp;
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to get instance public IP');
      return null;
    }
  }

  /**
   * Make a request to the agent API
   */
  private async agentRequest<T>(
    instanceId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | undefined>,
  ): Promise<T> {
    const publicIp = await this.getInstancePublicIp(instanceId);
    if (!publicIp) {
      throw new Error(`Could not determine public IP for instance ${instanceId}`);
    }

    const url = new URL(`http://${publicIp}:${AGENT_API_PORT}${path}`);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, value);
        }
      });
    }

    const requestInit: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      requestInit.body = JSON.stringify(body);
    }

    logger.debug({ url: url.toString(), method }, 'Making agent request');

    try {
      const response = await fetch(url.toString(), requestInit);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Agent request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error({ err: error, url: url.toString() }, 'Agent request failed');
      throw error;
    }
  }

  /**
   * Perform DNS lookup
   */
  async lookup(
    hostname: string,
    recordType: DNSRecordType = 'A',
    instanceId?: string,
  ): Promise<DNSLookupResponse> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    
    return this.agentRequest<DNSLookupResponse>(
      targetInstanceId,
      'GET',
      '/agent/dns/lookup',
      undefined,
      {
        hostname,
        type: recordType,
      },
    );
  }

  /**
   * Get comprehensive DNS diagnostics for a domain
   */
  async getDiagnostics(
    hostname: string,
    instanceId?: string,
  ): Promise<{
    domain: string;
    records: Record<string, DNSRecord[]>;
    timestamp: string;
    summary: {
      hasA: boolean;
      hasAAAA: boolean;
      hasMX: boolean;
      hasNS: boolean;
      hasTXT: boolean;
      hasCNAME: boolean;
    };
  }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    const recordTypes: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'];
    const diagnostics: Record<string, DNSRecord[]> = {};
    
    for (const type of recordTypes) {
      try {
        const response = await this.lookup(hostname, type, targetInstanceId);
        if (response.count > 0) {
          diagnostics[type] = response.records;
        }
      } catch (error) {
        // Skip if record type not found
        logger.debug({ err: error, hostname, type }, 'Record type not found, skipping');
      }
    }

    return {
      domain: hostname,
      records: diagnostics,
      timestamp: new Date().toISOString(),
      summary: {
        hasA: !!diagnostics.A,
        hasAAAA: !!diagnostics.AAAA,
        hasMX: !!diagnostics.MX,
        hasNS: !!diagnostics.NS,
        hasTXT: !!diagnostics.TXT,
        hasCNAME: !!diagnostics.CNAME,
      },
    };
  }
}

