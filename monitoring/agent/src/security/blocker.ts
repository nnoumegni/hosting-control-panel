// agent/src/security/blocker.ts
import { logger } from "../core/logger";
import { state } from "../core/state";
import { addRule, removeRule } from "./sg-manager";

export async function blockIp(ip: string, reason: string) {
  const now = Date.now();

  // Already blocked?
  if (state.blockedIps.has(ip)) {
    logger.warn(`IP already blocked: ${ip}`);
    return;
  }

  const blockMs = state.settings.blockMinutes * 60 * 1000;
  const expiresAt = now + blockMs;

  logger.warn(`BLOCKING IP ${ip} for ${reason}`);

  const added = await addRule(ip);
  if (!added) return;

  state.blockedIps.set(ip, {
    reason,
    blockedAt: now,
    expiresAt,
  });
}

export async function unblockExpiredIps() {
  const now = Date.now();
  const toRemove: string[] = [];

  for (const [ip, entry] of state.blockedIps) {
    if (entry.expiresAt <= now) {
      toRemove.push(ip);
    }
  }

  for (const ip of toRemove) {
    logger.info(`UNBLOCKING expired IP ${ip}`);
    await removeRule(ip);
    state.blockedIps.delete(ip);
  }
}
