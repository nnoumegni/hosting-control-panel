# WebSocket Authentication Comparison

## Agent Documentation Specification

According to the agent documentation:

```go
signature = HMAC-SHA256(secret, JSON.stringify({
  type, agentId, ts, nonce, payload
}))
```

The signature is hex-encoded and included in the `signature` field.

## Our Implementation

### Signature Computation (`websocket.protocol.ts`)

```typescript
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
```

### Verification (`websocket.protocol.ts`)

```typescript
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
```

## Potential Issues

### 1. JSON Key Ordering

**Issue**: `JSON.stringify()` in JavaScript/TypeScript preserves key order, but Go's `json.Marshal` may use a different order.

**Impact**: If the Go agent serializes the JSON with different key order, the HMAC signatures won't match.

**Solution**: Both implementations should use a consistent key order. The documentation shows:
```
{ type, agentId, ts, nonce, payload }
```

Our implementation uses the same order, which should match if Go's `json.Marshal` also preserves struct field order.

### 2. JSON Whitespace

**Issue**: `JSON.stringify()` in JavaScript may include or exclude whitespace differently than Go.

**Impact**: Different JSON strings = different HMAC signatures.

**Solution**: Both should use compact JSON (no extra whitespace). Our implementation uses `JSON.stringify()` which produces compact JSON by default.

### 3. Timestamp Format

**Issue**: The documentation specifies Unix timestamp in milliseconds.

**Our implementation**: Uses `Date.now()` which returns milliseconds since epoch - ✅ Matches

### 4. Nonce Format

**Issue**: The documentation specifies UUID format.

**Our implementation**: Uses `crypto.randomUUID()` which generates RFC 4122 UUIDs - ✅ Matches

## Verification Flow

1. **Agent sends auth message** with signature
2. **Server receives message** and parses JSON
3. **Server extracts signature** from envelope
4. **Server recomputes signature** using the same fields (without signature)
5. **Server compares signatures** using timing-safe comparison
6. **Server verifies timestamp** (5-minute window)
7. **Server registers agent** if all checks pass

## Test Case

To verify compatibility, test with this exact structure:

```json
{
  "type": "auth",
  "agentId": "test-agent",
  "ts": 1731819422000,
  "nonce": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "hostname": "test-server",
    "version": "1.0.0"
  },
  "signature": "<computed-hmac-hex>"
}
```

The signature should be computed as:
```
HMAC-SHA256(secret, '{"type":"auth","agentId":"test-agent","ts":1731819422000,"nonce":"550e8400-e29b-41d4-a716-446655440000","payload":{"hostname":"test-server","version":"1.0.0"}}')
```

## Recommendations

1. **Verify Go agent uses same JSON key order** - Check Go's `json.Marshal` output
2. **Test with actual agent** - Connect a real agent and verify signatures match
3. **Add logging** - Log the exact JSON string being signed for debugging
4. **Compare byte-by-byte** - Ensure no hidden characters or encoding differences

