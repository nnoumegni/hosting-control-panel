// agent/src/monitoring/detectors.ts
import { TailEvent } from "./tailer";
import { MaliciousPatterns } from "./patterns";
import { logger } from "../core/logger";
import { blockIp } from "../security/blocker";
import { state } from "../core/state";

interface HitCounter {
  count: number;
  firstSeen: number;
}

const hits: Record<string, HitCounter> = {};
const RATE_WINDOW = 10 * 1000; // 10 seconds
const RATE_THRESHOLD = 80; // 80 requests per 10s

export async function handleLogEvent(evt: TailEvent) {
  const now = Date.now();

  // RATE-LIMIT DETECTOR
  if (!hits[evt.ip]) {
    hits[evt.ip] = { count: 0, firstSeen: now };
  }
  hits[evt.ip].count++;

  if (now - hits[evt.ip].firstSeen > RATE_WINDOW) {
    hits[evt.ip] = { count: 1, firstSeen: now };
  }

  if (hits[evt.ip].count > RATE_THRESHOLD) {
    logger.warn("Rate-limit exceeded", { ip: evt.ip });
    await blockIp(evt.ip, "high-rate");
    return;
  }

  // URL PATTERN DETECTOR
  for (const pattern of MaliciousPatterns) {
    if (pattern.test(evt.path)) {
      logger.warn("Malicious pattern match", { ip: evt.ip, path: evt.path });
      await blockIp(evt.ip, "pattern:" + pattern.toString());
      return;
    }
  }

  // STATUS CODE DETECTOR (many 404 = scanning)
  if (evt.status === 404) {
    if (!hits[evt.ip].scan404) hits[evt.ip].scan404 = 0;
    hits[evt.ip].scan404++;

    if (hits[evt.ip].scan404 > 20) {
      logger.warn("Suspicious 404 scan", { ip: evt.ip });
      await blockIp(evt.ip, "404-scan");
      return;
    }
  }
}
