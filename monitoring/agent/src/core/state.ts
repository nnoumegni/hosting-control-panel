// agent/src/core/state.ts
import { AgentConfig } from "./config";

export interface BlockedIp {
  ip: string;
  reason: string;
  blockedAt: number;
}

export interface AgentState {
  config: AgentConfig;
  blockedIps: BlockedIp[];
  lastHeartbeat: number | null;
  lastUpdateCheck: number | null;
}

export const state: AgentState = {
  config: {} as AgentConfig,
  blockedIps: [],
  lastHeartbeat: null,
  lastUpdateCheck: null,
};
