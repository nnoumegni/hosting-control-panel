import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { logger } from '../../core/logger/index.js';
import { BadRequestError } from '../../shared/errors.js';
import type { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import type { GatewayAISettingsProvider } from './gateway-ai-settings-provider.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

const AGENT_API_PORT = 9811;

export interface GatewayStatus {
  enabled: boolean;
  version?: string;
  uptime?: number;
  ai: {
    enabled: boolean;
    model?: string;
    rulesGenerated?: number;
  };
}

export interface FirewallRules {
  adaptive?: {
    blockIps?: string[];
    blockCidrs?: string[];
    blockAsns?: number[];
  };
  ai: {
    blockIps: string[];
    blockCidrs: string[];
    blockAsns: number[];
  };
  static: {
    blockIps?: string[];
    blockCidrs?: string[];
    blockAsns?: number[];
  };
}

export interface GatewayStats {
  lastUpdated: string;
  stats: {
    totalRequests: number;
    topIps: Array<{ ip: string; requests: number }>;
    topCountries: Array<{ country: string; requests: number }>;
    topAsns: Array<{ asn: number; requests: number }>;
    topPaths: Array<{ path: string; requests: number }>;
  };
}

export class GatewayService {
  constructor(
    private readonly serverSettingsProvider: ServerSettingsProvider,
    private readonly aiSettingsProvider: GatewayAISettingsProvider,
  ) {}

  async getServerSettings() {
    return this.serverSettingsProvider.getSettings();
  }

  async getAISettings() {
    return this.aiSettingsProvider.getSettings();
  }

  async updateAISettings(params: Parameters<GatewayAISettingsProvider['upsertSettings']>[0]) {
    return this.aiSettingsProvider.upsertSettings(params);
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
   * Make HTTP request to agent API
   */
  private async agentRequest<T>(
    instanceId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any,
  ): Promise<T> {
    if (!instanceId) {
      throw new BadRequestError('EC2 instance ID is required');
    }

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

  async getStatus(instanceId: string): Promise<GatewayStatus> {
    return this.agentRequest<GatewayStatus>(instanceId, 'GET', '/gateway/status');
  }

  async getRules(instanceId: string): Promise<FirewallRules> {
    return this.agentRequest<FirewallRules>(instanceId, 'GET', '/gateway/rules');
  }

  async getStats(instanceId: string): Promise<GatewayStats> {
    return this.agentRequest<GatewayStats>(instanceId, 'GET', '/gateway/stats');
  }
}
