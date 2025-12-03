/**
 * WebSocket service to manage agent connections
 */

import type { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../core/logger/index.js';
import type { AgentSession, Envelope, CommandPayload, MetricsPayload, LogPayload } from './websocket.types.js';
import { verifyEnvelope, isTimestampValid, computeSignature, generateNonce } from './websocket.protocol.js';

export interface AgentSecretsProvider {
  getSecret(agentId: string): Promise<string | null>;
}

export interface DashboardSession {
  socket: import('ws').WebSocket;
  instanceId: string | null;
  connectedAt: number;
}

export class WebSocketService extends EventEmitter {
  private agents = new Map<string, AgentSession>();
  private dashboards = new Map<string, DashboardSession>();
  private secretsProvider: AgentSecretsProvider;

  constructor(secretsProvider: AgentSecretsProvider) {
    super();
    this.secretsProvider = secretsProvider;
  }

  /**
   * Register a new agent connection
   */
  async registerAgent(
    socket: WebSocket,
    agentId: string,
    hostname?: string,
    version?: string,
  ): Promise<void> {
    // If agent is already registered, close the old connection
    const existing = this.agents.get(agentId);
    if (existing && existing.socket !== socket) {
      logger.warn({ agentId }, 'Agent reconnecting, closing old connection');
      existing.socket.close(1000, 'replaced_by_new_connection');
    }

    const session: AgentSession = {
      socket,
      agentId,
      lastSeen: Date.now(),
      hostname,
      version,
      connectedAt: Date.now(),
    };

    this.agents.set(agentId, session);
    logger.info({ agentId, hostname, version }, 'Agent connected via WebSocket');

    // Update lastSeen on any message
    socket.on('message', () => {
      const existing = this.agents.get(agentId);
      if (existing) {
        existing.lastSeen = Date.now();
      }
    });

    socket.on('close', () => {
      this.agents.delete(agentId);
      logger.info({ agentId }, 'Agent disconnected from WebSocket');
      this.emit('agentDisconnected', agentId);
    });

    socket.on('error', (error) => {
      logger.error({ agentId, error }, 'WebSocket error');
    });

    this.emit('agentConnected', agentId, session);
  }

  /**
   * Handle incoming message from agent
   */
  async handleMessage(socket: WebSocket, rawMessage: Buffer): Promise<void> {
    let env: Envelope;
    try {
      env = JSON.parse(rawMessage.toString()) as Envelope;
    } catch (error) {
      logger.warn({ error }, 'Invalid JSON from WebSocket client');
      socket.close(1003, 'invalid_json');
      return;
    }

    // Get secret for this agent
    const secret = await this.secretsProvider.getSecret(env.agentId);
    if (!secret) {
      logger.warn({ agentId: env.agentId }, 'Unknown agent ID');
      socket.close(1008, 'unknown_agent');
      return;
    }

    // Verify signature
    if (!verifyEnvelope(env, secret)) {
      logger.warn({ agentId: env.agentId }, 'Invalid signature');
      socket.close(1008, 'invalid_signature');
      return;
    }

    // Verify timestamp (prevent replay attacks)
    if (!isTimestampValid(env.ts)) {
      logger.warn({ agentId: env.agentId, ts: env.ts }, 'Invalid timestamp');
      socket.close(1008, 'invalid_timestamp');
      return;
    }

    // Update last seen
    const session = this.agents.get(env.agentId);
    if (session) {
      session.lastSeen = Date.now();
    }

    // Handle message by type
    switch (env.type) {
      case 'auth':
        await this.handleAuth(socket, env);
        break;
      case 'metrics':
        await this.handleMetrics(env);
        break;
      case 'log':
        await this.handleLog(env);
        break;
      case 'command_result':
        await this.handleCommandResult(env);
        break;
      case 'heartbeat':
        await this.handleHeartbeat(env);
        break;
      default:
        logger.warn({ agentId: env.agentId, type: env.type }, 'Unknown message type');
    }
  }

  private async handleAuth(socket: WebSocket, env: Envelope): Promise<void> {
    const payload = env.payload as { hostname?: string; version?: string };
    
    // Register the agent if not already registered
    // This happens after signature verification in handleMessage
    let session = this.agents.get(env.agentId);
    if (!session) {
      // Agent not registered yet, register it now (after verification)
      await this.registerAgent(socket, env.agentId, payload.hostname, payload.version);
      session = this.agents.get(env.agentId);
    } else {
      // Update existing session with auth info
      session.hostname = payload.hostname;
      session.version = payload.version;
    }
    
    logger.info({ agentId: env.agentId, ...payload }, 'Agent authenticated via WebSocket');
    this.emit('agentAuthenticated', env.agentId, payload);
  }

  private async handleMetrics(env: Envelope): Promise<void> {
    const payload = env.payload as MetricsPayload;
    logger.debug({ agentId: env.agentId, metrics: payload }, 'Received metrics');
    this.emit('metrics', env.agentId, payload);
  }

  private async handleLog(env: Envelope): Promise<void> {
    const payload = env.payload as LogPayload;
    logger.debug({ agentId: env.agentId, log: payload }, 'Received log');
    this.emit('log', env.agentId, payload);
    
    // Broadcast to dashboard clients if this is analytics data
    if (payload.source === 'analytics' || payload.message?.includes('analytics')) {
      this.broadcastToDashboards({
        type: 'analytics',
        agentId: env.agentId,
        payload,
        timestamp: Date.now(),
      });
    }
  }

  private async handleCommandResult(env: Envelope): Promise<void> {
    const payload = env.payload as { command: string; result: string; error?: string };
    logger.debug({ agentId: env.agentId, result: payload }, 'Received command result');
    this.emit('commandResult', env.agentId, payload);
  }

  private async handleHeartbeat(env: Envelope): Promise<void> {
    // Heartbeat is already handled by updating lastSeen
    logger.debug({ agentId: env.agentId }, 'Received heartbeat');
    this.emit('heartbeat', env.agentId);
  }

  /**
   * Send a command to an agent
   */
  async sendCommand(agentId: string, command: string, args?: Record<string, string>): Promise<boolean> {
    const session = this.agents.get(agentId);
    if (!session || session.socket.readyState !== 1) {
      // WebSocket.OPEN = 1
      logger.warn({ agentId }, 'Agent not connected');
      return false;
    }

    const secret = await this.secretsProvider.getSecret(agentId);
    if (!secret) {
      logger.warn({ agentId }, 'Unknown agent secret');
      return false;
    }

    const payload: CommandPayload = {
      command,
      args: args || {},
    };

    const envWithoutSig = {
      type: 'command' as const,
      agentId,
      ts: Date.now(),
      nonce: generateNonce(),
      payload,
    };

    const signature = computeSignature(envWithoutSig, secret);
    const env: Envelope<CommandPayload> = {
      ...envWithoutSig,
      signature,
    };

    try {
      session.socket.send(JSON.stringify(env));
      logger.info({ agentId, command }, 'Sent command to agent');
      return true;
    } catch (error) {
      logger.error({ agentId, command, error }, 'Failed to send command');
      return false;
    }
  }

  /**
   * Get list of connected agents
   */
  getConnectedAgents(): Array<{
    agentId: string;
    lastSeen: number;
    hostname?: string;
    version?: string;
    connectedAt: number;
  }> {
    return Array.from(this.agents.values()).map((session) => ({
      agentId: session.agentId,
      lastSeen: session.lastSeen,
      hostname: session.hostname,
      version: session.version,
      connectedAt: session.connectedAt,
    }));
  }

  /**
   * Check if an agent is connected
   */
  isAgentConnected(agentId: string): boolean {
    const session = this.agents.get(agentId);
    return session !== undefined && session.socket.readyState === 1;
  }

  /**
   * Get agent session
   */
  getAgentSession(agentId: string): AgentSession | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Register a dashboard client connection
   */
  registerDashboard(socket: import('ws').WebSocket, dashboardId: string, instanceId: string | null = null): void {
    const session: DashboardSession = {
      socket,
      instanceId,
      connectedAt: Date.now(),
    };

    this.dashboards.set(dashboardId, session);
    logger.info({ dashboardId, instanceId }, 'Dashboard connected via WebSocket');

    socket.on('close', () => {
      this.dashboards.delete(dashboardId);
      logger.info({ dashboardId }, 'Dashboard disconnected from WebSocket');
    });

    socket.on('error', (error) => {
      logger.error({ dashboardId, error }, 'Dashboard WebSocket error');
    });
  }

  /**
   * Broadcast data to all connected dashboard clients
   */
  broadcastToDashboards(data: unknown): void {
    const message = JSON.stringify(data);
    let sentCount = 0;
    
    for (const [dashboardId, session] of this.dashboards.entries()) {
      if (session.socket.readyState === 1) {
        // WebSocket.OPEN = 1
        try {
          session.socket.send(message);
          sentCount++;
        } catch (error) {
          logger.error({ dashboardId, error }, 'Failed to send message to dashboard');
        }
      }
    }
    
    if (sentCount > 0) {
      logger.debug({ sentCount, totalDashboards: this.dashboards.size }, 'Broadcasted to dashboards');
    }
  }

  /**
   * Broadcast analytics data to dashboards for a specific instance
   */
  broadcastAnalytics(instanceId: string, analyticsData: unknown): void {
    const message = JSON.stringify({
      type: 'analytics',
      instanceId,
      data: analyticsData,
      timestamp: Date.now(),
    });

    let sentCount = 0;
    for (const [dashboardId, session] of this.dashboards.entries()) {
      // Send to all dashboards, or filter by instanceId if needed
      if (session.socket.readyState === 1) {
        try {
          session.socket.send(message);
          sentCount++;
        } catch (error) {
          logger.error({ dashboardId, error }, 'Failed to send analytics to dashboard');
        }
      }
    }
    
    if (sentCount > 0) {
      logger.debug({ instanceId, sentCount }, 'Broadcasted analytics to dashboards');
    }
  }
}

