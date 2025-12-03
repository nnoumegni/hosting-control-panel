// agent/src/core/state.ts

export interface BlockEntry {
  reason: string;
  blockedAt: number;
  expiresAt: number;
}

export const state = {
  blockedIps: new Map<string, BlockEntry>(),

  settings: {
    sgId: "sg-xxxxx",       // set dynamically from config file
    blockMinutes: 30,       // block IP for 30 minutes
  },
};
