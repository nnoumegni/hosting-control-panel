// agent/src/core/system.ts
import os from "os";
import { logger } from "./logger";

export interface SystemInfo {
  cpuLoad: number;
  memoryUsedPct: number;
  uptime: number;
}

export function getSystemStats(): SystemInfo {
  const loads = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    cpuLoad: Math.round(loads[0] * 100) / 100,
    memoryUsedPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
    uptime: os.uptime(),
  };
}


export async function restartAll() {
  logger.warn("Restarting agent subsystems...");

  // Future: restart log tailer, detectors, geo engine, etc.
  // Right now we treat this as a hot reload stub.

  return true;
}