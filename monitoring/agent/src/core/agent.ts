// agent/src/core/agent.ts
import { loadConfig } from "./config";
import { state } from "./state";
import { logger } from "./logger";
import { scheduler } from "./scheduler";
import { heartbeat } from "./heartbeat";
import { checkForUpdates } from "./updater";

export async function startAgent() {
  logger.info("Starting JetCamer Security Agent v1.0.0");

  // Load config
  state.config = loadConfig();

  logger.info("Loaded config", state.config);

  // Schedule heartbeats
  scheduler.add(state.config.heartbeatInterval, heartbeat);

  // Auto-update every 5 minutes
  scheduler.add(300, checkForUpdates);

  // Start scheduler
  scheduler.start();

  logger.info("Agent is running...");
}
