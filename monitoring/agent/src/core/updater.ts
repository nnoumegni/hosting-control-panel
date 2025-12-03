// agent/src/core/updater.ts
import { state } from "./state";
import { logger } from "./logger";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export async function checkForUpdates() {
  if (!state.config.autoUpdate) return;

  try {
    const url = `${state.config.autoUpdateUrl}/latest.json`;

    const res = await fetch(url);
    if (!res.ok) return;

    const metadata = await res.json();
    const latest = metadata.version;

    if (latest === state.config.version) return;

    logger.info(
      `New version available: ${latest} (current ${state.config.version})`
    );

    await downloadAndInstall(latest);
  } catch (err) {
    logger.error("Update check failed", err);
  }
}

async function downloadAndInstall(version: string) {
  const binaryUrl = `${state.config.autoUpdateUrl}/${version}`;
  logger.info("Downloading update from", binaryUrl);

  const res = await fetch(binaryUrl);
  if (!res.ok) {
    logger.error("Download failed");
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  const filePath = "/usr/local/bin/jetcamer-agent-new";
  fs.writeFileSync(filePath, buffer);
  fs.chmodSync(filePath, 0o755);

  logger.info("Replacing binary...");

  execSync(`mv /usr/local/bin/jetcamer-agent-new /usr/local/bin/jetcamer-agent`);
  execSync("systemctl restart jetcamer-agent");

  logger.info("Updated successfully to version " + version);
}
