/**
 * WebSocket protocol utilities for signing and verifying messages
 */

import crypto from 'crypto';
import type { Envelope } from './websocket.types.js';

/**
 * Compute HMAC-SHA256 signature for an envelope
 */
export function computeSignature(
  env: Omit<Envelope, 'signature'>,
  secret: string,
): string {
  const toSign = JSON.stringify({
    type: env.type,
    agentId: env.agentId,
    ts: env.ts,
    nonce: env.nonce,
    payload: env.payload,
  });

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(toSign);
  return hmac.digest('hex');
}

/**
 * Verify an envelope's signature
 */
export function verifyEnvelope(env: Envelope, secret: string): boolean {
  try {
    const { signature, ...rest } = env;
    const expected = computeSignature(rest, secret);

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch (error) {
    return false;
  }
}

/**
 * Check if a timestamp is within acceptable range (prevent replay attacks)
 */
export function isTimestampValid(ts: number, maxAgeMs: number = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const age = now - ts;
  return age >= 0 && age <= maxAgeMs;
}

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  return crypto.randomUUID();
}

