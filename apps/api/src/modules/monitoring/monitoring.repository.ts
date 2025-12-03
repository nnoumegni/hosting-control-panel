import { ObjectId } from 'mongodb';

export interface SystemMetrics {
  cpuLoad: number;
  memoryUsedPct: number;
  uptime: number;
  diskUsage?: {
    total: number;
    used: number;
    available: number;
    percent: number;
  };
  networkStats?: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
}

export interface AgentHeartbeat {
  _id?: ObjectId;
  instanceId: string;
  version: string;
  timestamp: Date;
  metrics: SystemMetrics;
  blockedIps?: string[];
  status: 'online' | 'offline';
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LogEvent {
  _id?: ObjectId;
  instanceId: string;
  timestamp: Date;
  ip: string;
  path: string;
  status: number;
  method?: string;
  userAgent?: string;
  raw: string;
  createdAt: Date;
}

export interface AgentConfig {
  _id?: ObjectId;
  instanceId: string;
  dashboardUrl: string;
  logPaths: string[];
  tailFormat: 'apache-clf' | 'nginx' | 'nginx-json';
  autoUpdate: boolean;
  heartbeatInterval: number;
  requestThreshold?: number;
  blockDurationMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentConfigInput {
  instanceId: string;
  dashboardUrl?: string;
  logPaths?: string[];
  tailFormat?: 'apache-clf' | 'nginx' | 'nginx-json';
  autoUpdate?: boolean;
  heartbeatInterval?: number;
  requestThreshold?: number;
  blockDurationMinutes?: number;
}

export interface UpdateAgentConfigInput {
  dashboardUrl?: string;
  logPaths?: string[];
  tailFormat?: 'apache-clf' | 'nginx' | 'nginx-json';
  autoUpdate?: boolean;
  heartbeatInterval?: number;
  requestThreshold?: number;
  blockDurationMinutes?: number;
}

export interface MonitoringRepository {
  // Heartbeat methods
  saveHeartbeat(heartbeat: Omit<AgentHeartbeat, '_id' | 'createdAt' | 'updatedAt'>): Promise<AgentHeartbeat>;
  getLatestHeartbeat(instanceId: string): Promise<AgentHeartbeat | null>;
  getHeartbeats(instanceId: string, limit?: number, startDate?: Date, endDate?: Date): Promise<AgentHeartbeat[]>;
  getOnlineAgents(): Promise<string[]>;
  
  // Log event methods
  saveLogEvent(event: Omit<LogEvent, '_id' | 'createdAt'>): Promise<LogEvent>;
  getLogEvents(instanceId: string, limit?: number, startDate?: Date, endDate?: Date): Promise<LogEvent[]>;
  getLogEventsByIp(ip: string, limit?: number): Promise<LogEvent[]>;
  
  // Agent config methods
  saveAgentConfig(config: CreateAgentConfigInput): Promise<AgentConfig>;
  getAgentConfig(instanceId: string): Promise<AgentConfig | null>;
  updateAgentConfig(instanceId: string, updates: UpdateAgentConfigInput): Promise<AgentConfig | null>;
  deleteAgentConfig(instanceId: string): Promise<void>;
  
  // Aggregation methods
  getMetricsSummary(instanceId: string, startDate: Date, endDate: Date): Promise<{
    avgCpuLoad: number;
    avgMemoryUsed: number;
    maxCpuLoad: number;
    maxMemoryUsed: number;
    totalRequests: number;
    uniqueIps: number;
  } | null>;
}

