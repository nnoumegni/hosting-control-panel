import { apiFetch } from './api';

// Types matching what the component expects
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

class GatewayApi {
  /**
   * Get gateway status from agent
   * This endpoint should be proxied through the API server to the agent
   */
  async getStatus(instanceId: string): Promise<GatewayStatus> {
    return apiFetch<GatewayStatus>(`gateway/status?instanceId=${encodeURIComponent(instanceId)}`);
  }

  /**
   * Get firewall rules from agent
   */
  async getRules(instanceId: string): Promise<FirewallRules> {
    return apiFetch<FirewallRules>(`gateway/rules?instanceId=${encodeURIComponent(instanceId)}`);
  }

  /**
   * Get gateway statistics from agent
   */
  async getStats(instanceId: string): Promise<GatewayStats> {
    return apiFetch<GatewayStats>(`gateway/stats?instanceId=${encodeURIComponent(instanceId)}`);
  }
}

export const gatewayApi = new GatewayApi();
