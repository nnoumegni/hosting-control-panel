import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { getEc2InstanceId } from '../../shared/aws/ec2-instance-detection.js';
import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';

const AGENT_API_PORT = 9811;

export interface DashboardSummary {
  totalRequests: number;
  uniqueIPs: number;
  highRiskIndicators: number;
  attacksPerMinute: number;
  threatCategories: {
    brute_force: number;
    credential_stuffing: number;
    recon: number;
    bot_activity: number;
    clean: number;
  };
}

export interface TimeSeriesPoint {
  timestamp: string;
  count: number;
  highRisk: number;
}

export interface TimeSeriesData {
  interval: 'hour' | 'day';
  points: TimeSeriesPoint[];
}

export interface ThreatCategory {
  category: string;
  count: number;
  ips: number;
}

export interface IPSummary {
  ip: string;
  totalCount: number;
  country?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  asn: number;
  asnName?: string;
  threatScore: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  threatCategories: string[];
  failedAuthCount: number;
  authPathCount: number;
  uniquePaths: number;
  browser?: string;
  deviceModel?: string;
  platform?: string;
  lastSeen: string;
  lastPath?: string;
  lastReferrer?: string;
  firstSeen: string;
}

export interface SummaryResponse {
  total: number;
  limit: number;
  offset: number;
  results?: IPSummary[];
  groups?: Array<{ key: string; count: number }>;
}

export interface IPReputation {
  ip: string;
  threatScore: number;
  badRequests: number;
  goodRequests: number;
  badPercentage: number;
  failedLogins: number;
  lastSeen: string;
  isBlocked: boolean;
  blockReason?: string;
}

export interface IPReputationResponse {
  total: number;
  limit: number;
  reputations: IPReputation[];
}

export interface CIDROffender {
  cidr: string;
  mask: number;
  maliciousIPs: number;
  totalIPs: number;
  avgThreatScore: number;
  avgBadPercentage: number;
  totalRequests: number;
  lastAttack: string;
  attackEvents: number;
}

export interface CIDROffendersResponse {
  total: number;
  limit: number;
  mask: number;
  offenders: CIDROffender[];
}

export interface ASNReputation {
  asn: number;
  asnName: string;
  category: string;
  maliciousIPs: number;
  totalIPs: number;
  avgThreatScore: number;
  avgBadPercentage: number;
  cidrsInvolved: number;
  totalRequests: number;
  lastAttack: string;
}

export interface ASNReputationResponse {
  total: number;
  limit: number;
  reputations: ASNReputation[];
}

export interface BlockEvent {
  type: 'ip' | 'cidr' | 'asn';
  value: string;
  reason: string;
  score: number;
  duration: string;
  timestamp: string;
}

export interface BlockEventsResponse {
  events: BlockEvent[];
  total: number;
}

export class SecurityAnalyticsService {
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

  /**
   * Get dashboard summary metrics
   */
  async getDashboardSummary(instanceId?: string, days: number = 7): Promise<DashboardSummary> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<DashboardSummary>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/dashboard/summary',
      { days },
    );
  }

  /**
   * Get time-series data
   */
  async getTimeSeries(instanceId?: string, interval: 'hour' | 'day' = 'hour', days: number = 1): Promise<TimeSeriesData> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<TimeSeriesData>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/dashboard/timeseries',
      { interval, days },
    );
  }

  /**
   * Get threat category breakdown
   */
  async getThreatCategories(instanceId?: string, days: number = 7): Promise<ThreatCategory[]> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<ThreatCategory[]>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/dashboard/threat-categories',
      { days },
    );
  }

  /**
   * Get IP summary with filters
   */
  async getSummary(
    instanceId?: string,
    params: {
      limit?: number;
      offset?: number;
      query?: string;
      days?: number;
      groupBy?: 'cidr' | 'country' | 'city' | 'region' | 'platform';
      cidrMask?: number;
      minThreatScore?: number;
      threatLevel?: 'low' | 'medium' | 'high' | 'critical';
    } = {},
  ): Promise<SummaryResponse> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    const requestParams: Record<string, string | number> = {};
    
    if (params.limit) requestParams.limit = params.limit;
    if (params.offset) requestParams.offset = params.offset;
    if (params.query) requestParams.q = params.query;
    if (params.days) requestParams.days = params.days;
    if (params.groupBy) requestParams.groupBy = params.groupBy;
    if (params.cidrMask) requestParams.cidrMask = params.cidrMask;
    if (params.minThreatScore !== undefined) requestParams.minThreatScore = params.minThreatScore;
    if (params.threatLevel) requestParams.threatLevel = params.threatLevel;

    return this.agentRequest<SummaryResponse>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/summary',
      requestParams,
    );
  }

  /**
   * Get all dashboard data in one call
   */
  async getAllDashboardData(instanceId?: string, days: number = 7) {
    try {
      const [summary, timeseries, categories, topOffenders] = await Promise.all([
        this.getDashboardSummary(instanceId, days),
        this.getTimeSeries(instanceId, 'hour', 1),
        this.getThreatCategories(instanceId, days),
        this.getSummary(instanceId, { minThreatScore: 30, limit: 20 }),
      ]);
      return {
        metrics: summary,
        timeline: timeseries,
        threatCategories: categories,
        topOffenders: topOffenders.results || [],
      };
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Error fetching dashboard data');
      throw error;
    }
  }

  /**
   * Get IP reputation data
   */
  async getIPReputation(instanceId?: string, limit: number = 100): Promise<IPReputationResponse> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<IPReputationResponse>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/reputation/ip',
      { limit },
    );
  }

  /**
   * Get CIDR offenders
   */
  async getCIDROffenders(instanceId?: string, mask: number = 24, limit: number = 100): Promise<CIDROffendersResponse> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<CIDROffendersResponse>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/reputation/cidr',
      { mask, limit },
    );
  }

  /**
   * Get ASN reputation data
   */
  async getASNReputation(instanceId?: string, limit: number = 100): Promise<ASNReputationResponse> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<ASNReputationResponse>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/reputation/asn',
      { limit },
    );
  }

  /**
   * Get block events timeline
   */
  async getBlockEvents(instanceId?: string, days: number = 7): Promise<BlockEventsResponse> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    return this.agentRequest<BlockEventsResponse>(
      targetInstanceId,
      'GET',
      '/agent/requestlog/blocks/events',
      { days },
    );
  }
}

