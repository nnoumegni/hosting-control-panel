// agent/src/update/version-check.ts
import { logger } from "../core/logger";

export interface VersionResponse {
  version: string;
  url: string;
  signature: string;
}

export async function fetchLatestVersion(): Promise<VersionResponse | null> {
  try {
    const res = await fetch(
      "https://api.jetcamer.com/security/agent/version",
      { method: "GET" }
    );

    if (!res.ok) return null;
    return (await res.json()) as VersionResponse;
  } catch (e) {
    logger.error("Version check failed:", e);
    return null;
  }
}
