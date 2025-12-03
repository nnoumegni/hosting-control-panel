// agent/src/update/updater.ts
import fs from "fs";
import { execSync } from "child_process";
import { fetchLatestVersion } from "./version-check";
import { verifySignature } from "./signature";
import { logger } from "../core/logger";

const CURRENT_VERSION = "1.0.0";
const BINARY_PATH = "/usr/local/bin/jetcamer-agent";
const PUBLIC_KEY_PATH = "/etc/jetcamer/pubkey.pem";

export async function checkForUpdate() {
  const latest = await fetchLatestVersion();
  if (!latest) return;

  if (latest.version === CURRENT_VERSION) return;

  logger.warn(`New version available: ${latest.version}`);

  await downloadAndInstall(latest.url, latest.signature);
}

async function downloadAndInstall(url: string, signature: string) {
  const tmp = "/tmp/agent-update.bin";

  try {
    execSync(`curl -sSL ${url} -o ${tmp}`);

    const pubKey = fs.readFileSync(PUBLIC_KEY_PATH, "utf8");

    if (!verifySignature(tmp, signature, pubKey)) {
      logger.error("Updater: INVALID SIGNATURE — aborting");
      return;
    }

    // Install
    execSync(`chmod +x ${tmp}`);
    execSync(`mv ${tmp} ${BINARY_PATH}`);

    logger.info("Agent updated. Restarting…");

    execSync(`systemctl restart jetcamer-agent`);
  } catch (e) {
    logger.error("Update failed:", e);
  }
}
