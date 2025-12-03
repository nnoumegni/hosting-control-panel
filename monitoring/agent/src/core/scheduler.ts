// agent/src/core/scheduler.ts
import { updateGeoDatabases } from "../geo/downloader";
import { checkForUpdate } from "../update/updater";
import { logger } from "./logger";

export function startScheduler() {
  // Check update every 10 minutes
  setInterval(() => {
    logger.info("Checking for agent update");
    checkForUpdate();
  }, 10 * 60_000);

  // Update GeoIP DB every 24 hours
  setInterval(() => {
    logger.info("Updating GeoIP databases");
    updateGeoDatabases();
  }, 24 * 60 * 60_000);
}
