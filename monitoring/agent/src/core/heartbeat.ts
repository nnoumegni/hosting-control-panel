// agent/src/core/heartbeat.ts
import { state } from "./state";
import { getSystemStats } from "./system";
import { logger } from "./logger";

export async function heartbeat() {
  try {
    const stats = getSystemStats();

    await fetch(`${state.config.dashboardUrl}/agent/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceId: state.config.instanceId,
        version: state.config.version,
        blockedIps: state.blockedIps,
        system: stats,
      }),
    });

    state.lastHeartbeat = Date.now();
    logger.debug("Heartbeat sent", stats);
  } catch (e) {
    logger.error("Heartbeat failed", e);
  }
}
