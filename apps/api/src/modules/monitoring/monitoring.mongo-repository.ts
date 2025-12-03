import { ObjectId } from 'mongodb';
import { getCollection } from '../../config/mongo.js';
import type {
  AgentHeartbeat,
  LogEvent,
  AgentConfig,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  MonitoringRepository,
  SystemMetrics,
} from './monitoring.repository.js';

interface AgentHeartbeatDocument {
  _id: ObjectId;
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

interface LogEventDocument {
  _id: ObjectId;
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

interface AgentConfigDocument {
  _id: ObjectId;
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

const HEARTBEATS_COLLECTION = 'monitoring_heartbeats';
const LOG_EVENTS_COLLECTION = 'monitoring_log_events';
const AGENT_CONFIGS_COLLECTION = 'monitoring_agent_configs';

export class MongoMonitoringRepository implements MonitoringRepository {
  private heartbeatIndexPromise: Promise<void> | null = null;
  private logEventIndexPromise: Promise<void> | null = null;
  private configIndexPromise: Promise<void> | null = null;

  private async ensureHeartbeatIndexes() {
    if (this.heartbeatIndexPromise) {
      return this.heartbeatIndexPromise;
    }

    this.heartbeatIndexPromise = (async () => {
      const collection = await getCollection<AgentHeartbeatDocument>(HEARTBEATS_COLLECTION);
      await collection.createIndex({ instanceId: 1, timestamp: -1 });
      await collection.createIndex({ instanceId: 1, lastSeen: -1 });
      await collection.createIndex({ timestamp: -1 });
      await collection.createIndex({ status: 1 });
    })();

    return this.heartbeatIndexPromise;
  }

  private async ensureLogEventIndexes() {
    if (this.logEventIndexPromise) {
      return this.logEventIndexPromise;
    }

    this.logEventIndexPromise = (async () => {
      const collection = await getCollection<LogEventDocument>(LOG_EVENTS_COLLECTION);
      await collection.createIndex({ instanceId: 1, timestamp: -1 });
      await collection.createIndex({ ip: 1, timestamp: -1 });
      await collection.createIndex({ timestamp: -1 });
    })();

    return this.logEventIndexPromise;
  }

  private async ensureConfigIndexes() {
    if (this.configIndexPromise) {
      return this.configIndexPromise;
    }

    this.configIndexPromise = (async () => {
      const collection = await getCollection<AgentConfigDocument>(AGENT_CONFIGS_COLLECTION);
      await collection.createIndex({ instanceId: 1 }, { unique: true });
    })();

    return this.configIndexPromise;
  }

  async saveHeartbeat(
    heartbeat: Omit<AgentHeartbeat, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AgentHeartbeat> {
    await this.ensureHeartbeatIndexes();
    const collection = await getCollection<AgentHeartbeatDocument>(HEARTBEATS_COLLECTION);
    const now = new Date();

    const doc: AgentHeartbeatDocument = {
      _id: new ObjectId(),
      instanceId: heartbeat.instanceId,
      version: heartbeat.version,
      timestamp: heartbeat.timestamp,
      metrics: heartbeat.metrics,
      blockedIps: heartbeat.blockedIps,
      status: heartbeat.status,
      lastSeen: heartbeat.lastSeen,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.toHeartbeat(doc);
  }

  async getLatestHeartbeat(instanceId: string): Promise<AgentHeartbeat | null> {
    await this.ensureHeartbeatIndexes();
    const collection = await getCollection<AgentHeartbeatDocument>(HEARTBEATS_COLLECTION);
    const doc = await collection.findOne(
      { instanceId },
      { sort: { timestamp: -1 } },
    );
    return doc ? this.toHeartbeat(doc) : null;
  }

  async getHeartbeats(
    instanceId: string,
    limit = 100,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AgentHeartbeat[]> {
    await this.ensureHeartbeatIndexes();
    const collection = await getCollection<AgentHeartbeatDocument>(HEARTBEATS_COLLECTION);
    const query: any = { instanceId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }

    const docs = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return docs.map(this.toHeartbeat);
  }

  async getOnlineAgents(): Promise<string[]> {
    await this.ensureHeartbeatIndexes();
    const collection = await getCollection<AgentHeartbeatDocument>(HEARTBEATS_COLLECTION);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const docs = await collection
      .find({
        lastSeen: { $gte: fiveMinutesAgo },
        status: 'online',
      })
      .toArray();

    const instanceIds = new Set(docs.map((d) => d.instanceId));
    return Array.from(instanceIds);
  }

  async saveLogEvent(event: Omit<LogEvent, '_id' | 'createdAt'>): Promise<LogEvent> {
    await this.ensureLogEventIndexes();
    const collection = await getCollection<LogEventDocument>(LOG_EVENTS_COLLECTION);
    const now = new Date();

    const doc: LogEventDocument = {
      _id: new ObjectId(),
      instanceId: event.instanceId,
      timestamp: event.timestamp,
      ip: event.ip,
      path: event.path,
      status: event.status,
      method: event.method,
      userAgent: event.userAgent,
      raw: event.raw,
      createdAt: now,
    };

    await collection.insertOne(doc);
    return this.toLogEvent(doc);
  }

  async getLogEvents(
    instanceId: string,
    limit = 100,
    startDate?: Date,
    endDate?: Date,
  ): Promise<LogEvent[]> {
    await this.ensureLogEventIndexes();
    const collection = await getCollection<LogEventDocument>(LOG_EVENTS_COLLECTION);
    const query: any = { instanceId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }

    const docs = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return docs.map(this.toLogEvent);
  }

  async getLogEventsByIp(ip: string, limit = 100): Promise<LogEvent[]> {
    await this.ensureLogEventIndexes();
    const collection = await getCollection<LogEventDocument>(LOG_EVENTS_COLLECTION);
    const docs = await collection
      .find({ ip })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return docs.map(this.toLogEvent);
  }

  async saveAgentConfig(config: CreateAgentConfigInput): Promise<AgentConfig> {
    await this.ensureConfigIndexes();
    const collection = await getCollection<AgentConfigDocument>(AGENT_CONFIGS_COLLECTION);
    const now = new Date();

    const doc: AgentConfigDocument = {
      _id: new ObjectId(),
      instanceId: config.instanceId,
      dashboardUrl: config.dashboardUrl || 'http://localhost:4000',
      logPaths: config.logPaths || [
        '/var/log/apache2/access.log',
        '/var/log/httpd/access_log',
        '/var/log/nginx/access.log',
      ],
      tailFormat: config.tailFormat || 'apache-clf',
      autoUpdate: config.autoUpdate ?? true,
      heartbeatInterval: config.heartbeatInterval || 10,
      requestThreshold: config.requestThreshold,
      blockDurationMinutes: config.blockDurationMinutes,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.toAgentConfig(doc);
  }

  async getAgentConfig(instanceId: string): Promise<AgentConfig | null> {
    await this.ensureConfigIndexes();
    const collection = await getCollection<AgentConfigDocument>(AGENT_CONFIGS_COLLECTION);
    const doc = await collection.findOne({ instanceId });
    return doc ? this.toAgentConfig(doc) : null;
  }

  async updateAgentConfig(
    instanceId: string,
    updates: UpdateAgentConfigInput,
  ): Promise<AgentConfig | null> {
    await this.ensureConfigIndexes();
    const collection = await getCollection<AgentConfigDocument>(AGENT_CONFIGS_COLLECTION);
    const now = new Date();

    const updateDoc: any = {
      $set: {
        updatedAt: now,
      },
    };

    Object.keys(updates).forEach((key) => {
      if (key !== 'instanceId') {
        const value = (updates as any)[key];
        if (value !== undefined) {
          updateDoc.$set[key] = value;
        }
      }
    });

    const result = await collection.findOneAndUpdate({ instanceId }, updateDoc, {
      returnDocument: 'after',
    });

    return result ? this.toAgentConfig(result) : null;
  }

  async deleteAgentConfig(instanceId: string): Promise<void> {
    await this.ensureConfigIndexes();
    const collection = await getCollection<AgentConfigDocument>(AGENT_CONFIGS_COLLECTION);
    await collection.deleteOne({ instanceId });
  }

  async getMetricsSummary(
    instanceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    avgCpuLoad: number;
    avgMemoryUsed: number;
    maxCpuLoad: number;
    maxMemoryUsed: number;
    totalRequests: number;
    uniqueIps: number;
  } | null> {
    await this.ensureHeartbeatIndexes();
    await this.ensureLogEventIndexes();

    const heartbeatCollection = await getCollection<AgentHeartbeatDocument>(HEARTBEATS_COLLECTION);
    const logEventCollection = await getCollection<LogEventDocument>(LOG_EVENTS_COLLECTION);

    const [heartbeats, logEvents] = await Promise.all([
      heartbeatCollection
        .find({
          instanceId,
          timestamp: { $gte: startDate, $lte: endDate },
        })
        .toArray(),
      logEventCollection
        .find({
          instanceId,
          timestamp: { $gte: startDate, $lte: endDate },
        })
        .toArray(),
    ]);

    if (heartbeats.length === 0) {
      return null;
    }

    const cpuLoads = heartbeats.map((h) => h.metrics.cpuLoad);
    const memoryUseds = heartbeats.map((h) => h.metrics.memoryUsedPct);
    const uniqueIps = new Set(logEvents.map((e) => e.ip));

    return {
      avgCpuLoad: cpuLoads.reduce((a, b) => a + b, 0) / cpuLoads.length,
      avgMemoryUsed: memoryUseds.reduce((a, b) => a + b, 0) / memoryUseds.length,
      maxCpuLoad: Math.max(...cpuLoads),
      maxMemoryUsed: Math.max(...memoryUseds),
      totalRequests: logEvents.length,
      uniqueIps: uniqueIps.size,
    };
  }

  private toHeartbeat(doc: AgentHeartbeatDocument): AgentHeartbeat {
    return {
      _id: doc._id,
      instanceId: doc.instanceId,
      version: doc.version,
      timestamp: doc.timestamp,
      metrics: doc.metrics,
      blockedIps: doc.blockedIps,
      status: doc.status,
      lastSeen: doc.lastSeen,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toLogEvent(doc: LogEventDocument): LogEvent {
    return {
      _id: doc._id,
      instanceId: doc.instanceId,
      timestamp: doc.timestamp,
      ip: doc.ip,
      path: doc.path,
      status: doc.status,
      method: doc.method,
      userAgent: doc.userAgent,
      raw: doc.raw,
      createdAt: doc.createdAt,
    };
  }

  private toAgentConfig(doc: AgentConfigDocument): AgentConfig {
    return {
      _id: doc._id,
      instanceId: doc.instanceId,
      dashboardUrl: doc.dashboardUrl,
      logPaths: doc.logPaths,
      tailFormat: doc.tailFormat,
      autoUpdate: doc.autoUpdate,
      heartbeatInterval: doc.heartbeatInterval,
      requestThreshold: doc.requestThreshold,
      blockDurationMinutes: doc.blockDurationMinutes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

