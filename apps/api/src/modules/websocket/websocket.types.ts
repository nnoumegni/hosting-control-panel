/**
 * WebSocket message protocol types
 * Based on the wire protocol specification with JSON + HMAC signing
 */

export type MessageType = 'auth' | 'metrics' | 'log' | 'command' | 'command_result' | 'heartbeat';

export interface Envelope<T = unknown> {
  type: MessageType;
  agentId: string;
  ts: number;
  nonce: string;
  payload: T;
  signature: string;
}

export interface AuthPayload {
  hostname: string;
  version: string;
}

export interface MetricsPayload {
  cpuPercent: number;
  memPercent: number;
  diskUsage: number;
  networkIn?: number;
  networkOut?: number;
  loadAverage?: number[];
}

export interface LogPayload {
  level: string;
  message: string;
  timestamp?: number; // Optional - may not always be present
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface CommandPayload {
  command: string;
  args?: Record<string, string>;
}

export interface CommandResultPayload {
  command: string;
  result: string;
  error?: string;
}

export interface HeartbeatPayload {
  status: string;
}

export interface AgentSession {
  socket: import('ws').WebSocket;
  agentId: string;
  lastSeen: number;
  hostname?: string;
  version?: string;
  connectedAt: number;
}

