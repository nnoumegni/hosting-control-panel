# WebSocket Support for JetCamer Agent

## Overview

The JetCamer agent now supports **outbound WebSocket connections** to your API server for real-time bidirectional communication. This feature is **optional** and does not affect existing functionality.

**Key Benefits:**
- **Real-time metrics** - Receive system metrics (CPU, memory, disk) every 5 seconds
- **Live monitoring** - Heartbeat every 30 seconds for connection health
- **Remote commands** - Execute commands on agents remotely
- **Zero configuration** - Auto-detects public IP and uses AWS credentials
- **Auto-start** - Starts automatically when credentials become available

## Key Features

- **Outbound connections only** - No inbound ports required (NAT-friendly)
- **Automatic reconnection** - Exponential backoff with max 60s delay
- **HMAC-SHA256 message signing** - Secure message authentication
- **Real-time metrics** - System metrics sent every 5 seconds
- **Command execution** - Remote commands via WebSocket
- **Heartbeat** - Connection health monitoring (30s interval)

## Configuration

**WebSocket configuration is automatically detected** - no manual configuration required!

The agent automatically:
1. **Detects the server's public IP** from EC2 metadata service
2. **Uses the AWS secret key** as the shared secret (from stored credentials or environment)

### Auto-Configuration

The agent will automatically set:
- **`wsApiUrl`**: `wss://<public-ip>/agent` (detected from EC2 metadata)
- **`wsSecret`**: AWS secret access key (from stored credentials or `AWS_SECRET_ACCESS_KEY` environment variable)

### Manual Override (Optional)

If you need to override the auto-detected values, add to `/etc/jetcamer/agent.config.json`:

```json
{
  "wsApiUrl": "wss://api.yourdomain.com/agent",
  "wsSecret": "your-shared-secret-key"
}
```

### Configuration Fields

- **`wsApiUrl`** (string, optional): WebSocket server URL. If not set, auto-detected from EC2 public IP as `wss://<public-ip>/agent`
- **`wsSecret`** (string, optional): Shared secret for HMAC message signing. If not set, uses AWS secret access key

If both fields cannot be auto-detected and are not manually configured, the WebSocket client will **not start** and the agent will continue operating normally.

## Message Protocol

### Message Envelope

All messages follow this structure:

```json
{
  "type": "auth" | "metrics" | "log" | "command" | "command_result" | "heartbeat",
  "agentId": "agent-123",
  "ts": 1731819422000,
  "nonce": "random-uuid",
  "payload": { /* type-specific */ },
  "signature": "hex-hmac-sha256"
}
```

### Message Types

#### 1. `auth` (Agent → Server)

Sent immediately after connection:

```json
{
  "type": "auth",
  "agentId": "hostname-or-instance-id",
  "ts": 1731819422000,
  "nonce": "uuid",
  "payload": {
    "hostname": "server-01",
    "version": "4.0.3"
  },
  "signature": "..."
}
```

#### 2. `metrics` (Agent → Server)

Sent every 5 seconds:

```json
{
  "type": "metrics",
  "agentId": "agent-123",
  "ts": 1731819422000,
  "nonce": "uuid",
  "payload": {
    "cpuPercent": 25.5,
    "memPercent": 45.2,
    "diskUsage": 60.1
  },
  "signature": "..."
}
```

#### 3. `heartbeat` (Agent → Server)

Sent every 30 seconds:

```json
{
  "type": "heartbeat",
  "agentId": "agent-123",
  "ts": 1731819422000,
  "nonce": "uuid",
  "payload": {
    "status": "alive"
  },
  "signature": "..."
}
```

#### 4. `command` (Server → Agent)

Commands sent from server to agent:

```json
{
  "type": "command",
  "agentId": "agent-123",
  "ts": 1731819422000,
  "nonce": "uuid",
  "payload": {
    "command": "ping",
    "args": {}
  },
  "signature": "..."
}
```

#### 5. `command_result` (Agent → Server)

Response to commands:

```json
{
  "type": "command_result",
  "agentId": "agent-123",
  "ts": 1731819422000,
  "nonce": "uuid",
  "payload": {
    "command": "ping",
    "result": "pong",
    "error": ""
  },
  "signature": "..."
}
```

#### 6. `log` (Agent → Server)

Log messages (can be sent programmatically):

```json
{
  "type": "log",
  "agentId": "agent-123",
  "ts": 1731819422000,
  "nonce": "uuid",
  "payload": {
    "level": "info",
    "message": "Log message",
    "source": "optional-source"
  },
  "signature": "..."
}
```

## HMAC Signing

Messages are signed using HMAC-SHA256:

```go
signature = HMAC-SHA256(secret, JSON.stringify({
  type, agentId, ts, nonce, payload
}))
```

The signature is hex-encoded and included in the `signature` field.

## Supported Commands

The agent supports the following commands:

- **`ping`** - Returns "pong"
- **`run_health_check`** - Runs basic health checks
- **`get_version`** - Returns agent version
- **`get_machine_id`** - Returns machine ID from `/etc/machine-id`
- **`get_status`** - Returns systemd service status

## Implementation Details

### File Structure

```
internal/
  ws/
    protocol.go    # Message envelope and HMAC signing
    client.go      # WebSocket client with reconnect logic
  commands/
    handler.go     # Command execution handler
  metrics/
    collector.go   # System metrics collection
```

### Integration

The WebSocket client is integrated into `cmd/agent/main.go`:

- **Auto-starts** when credentials become available (no restart needed)
- **Monitors** for credentials every 10 seconds if not available at startup
- Runs in a separate goroutine
- Automatically reconnects on connection loss
- Gracefully shuts down on agent termination

### Auto-Start Behavior

The WebSocket client will automatically start when:
1. **At startup**: If credentials are available in config or environment
2. **After credentials are set**: Via `/internal/set-aws-config` endpoint
3. **During monitoring**: Checks every 10 seconds for newly available credentials

No agent restart is required when credentials are added later.

### Reconnection Logic

- Exponential backoff: `min(60, 2^attempt)` seconds
- Maximum delay: 60 seconds
- Automatic retry on connection failure

## Connecting to Receive Live Data

### Server Setup

To receive live data from agents, you need to set up a WebSocket server that:

1. **Listens on the agent's public IP** (or use a load balancer/reverse proxy)
2. **Accepts connections on `/agent` path**
3. **Verifies HMAC signatures** on all incoming messages
4. **Handles different message types** (auth, metrics, heartbeat, command_result)

### Quick Start: Node.js/TypeScript Server

Here's a complete example server implementation:

```typescript
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import crypto from 'crypto';

interface Envelope {
  type: string;
  agentId: string;
  ts: number;
  nonce: string;
  payload: any;
  signature: string;
}

// Store agent secrets (in production, use a database or secrets manager)
const AGENT_SECRETS: Record<string, string> = {
  'agent-001': 'your-aws-secret-key-here',
  // Add more agents as needed
};

// Compute HMAC signature
function computeSignature(env: Omit<Envelope, 'signature'>, secret: string): string {
  const toSign = JSON.stringify({
    type: env.type,
    agentId: env.agentId,
    ts: env.ts,
    nonce: env.nonce,
    payload: env.payload,
  });
  return crypto.createHmac('sha256', secret).update(toSign).digest('hex');
}

// Verify message signature
function verifyEnvelope(env: Envelope): boolean {
  const secret = AGENT_SECRETS[env.agentId];
  if (!secret) {
    console.warn(`[server] Unknown agent: ${env.agentId}`);
    return false;
  }

  const { signature, ...rest } = env;
  const expected = computeSignature(rest, secret);
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Track connected agents
const agents = new Map<string, { socket: WebSocket; lastSeen: number }>();

const server = http.createServer();
const wss = new WebSocketServer({ server, path: '/agent' });

wss.on('connection', (socket, req) => {
  console.log(`[server] New connection from ${req.socket.remoteAddress}`);
  let agentId: string | null = null;

  socket.on('message', (data) => {
    try {
      const env: Envelope = JSON.parse(data.toString());

      // Verify signature
      if (!verifyEnvelope(env)) {
        console.warn(`[server] Invalid signature from ${env.agentId}`);
        socket.close(1008, 'invalid_signature');
        return;
      }

      agentId = env.agentId;
      agents.set(agentId, { socket, lastSeen: Date.now() });

      // Handle different message types
      switch (env.type) {
        case 'auth':
          console.log(`[server] Agent authenticated: ${agentId}`, env.payload);
          // Send welcome message or initial command
          break;

        case 'metrics':
          console.log(`[server] Metrics from ${agentId}:`, env.payload);
          // Store metrics in database, send to monitoring system, etc.
          // env.payload contains: { cpuPercent, memPercent, diskUsage }
          break;

        case 'heartbeat':
          console.log(`[server] Heartbeat from ${agentId}`);
          // Update last seen timestamp
          if (agents.has(agentId)) {
            agents.get(agentId)!.lastSeen = Date.now();
          }
          break;

        case 'command_result':
          console.log(`[server] Command result from ${agentId}:`, env.payload);
          // Handle command execution results
          break;

        case 'log':
          console.log(`[server] Log from ${agentId}:`, env.payload);
          // Handle log messages
          break;

        default:
          console.log(`[server] Unknown message type: ${env.type}`);
      }
    } catch (error) {
      console.error('[server] Error processing message:', error);
      socket.close(1003, 'invalid_json');
    }
  });

  socket.on('close', () => {
    if (agentId) {
      agents.delete(agentId);
      console.log(`[server] Agent disconnected: ${agentId}`);
    }
  });

  socket.on('error', (error) => {
    console.error(`[server] WebSocket error:`, error);
  });
});

// Send command to an agent
function sendCommand(agentId: string, command: string, args?: Record<string, string>) {
  const session = agents.get(agentId);
  if (!session || session.socket.readyState !== WebSocket.OPEN) {
    console.warn(`[server] Agent not connected: ${agentId}`);
    return false;
  }

  const secret = AGENT_SECRETS[agentId];
  if (!secret) {
    console.warn(`[server] Unknown agent: ${agentId}`);
    return false;
  }

  const envWithoutSig = {
    type: 'command',
    agentId,
    ts: Date.now(),
    nonce: crypto.randomUUID(),
    payload: { command, args: args || {} },
  };

  const signature = computeSignature(envWithoutSig, secret);
  const env: Envelope = { ...envWithoutSig, signature };

  session.socket.send(JSON.stringify(env));
  return true;
}

// Start server
const PORT = process.env.PORT || 443; // Use 443 for wss://
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
  console.log(`Agents should connect to: wss://<public-ip>:${PORT}/agent`);
});
```

### Receiving Live Metrics

Once connected, you'll automatically receive:

- **Metrics every 5 seconds**: CPU, memory, and disk usage
- **Heartbeats every 30 seconds**: Connection health status
- **Auth message on connect**: Agent identification and version

Example metrics payload:
```json
{
  "type": "metrics",
  "agentId": "server-01",
  "ts": 1731819422000,
  "nonce": "uuid",
  "payload": {
    "cpuPercent": 25.5,
    "memPercent": 45.2,
    "diskUsage": 60.1
  },
  "signature": "..."
}
```

### Sending Commands to Agents

To send a command to a connected agent:

```typescript
// Ping an agent
sendCommand('server-01', 'ping');

// Get agent version
sendCommand('server-01', 'get_version');

// Run health check
sendCommand('server-01', 'run_health_check');

// Get machine ID
sendCommand('server-01', 'get_machine_id');
```

The agent will respond with a `command_result` message containing the execution result.

## Debugging and Monitoring

### Check WebSocket Status

Use the debug endpoint to check WebSocket client status:

```bash
curl http://127.0.0.1:9811/internal/ws-status | jq
```

Response example:
```json
{
  "started": true,
  "hasClient": true,
  "hasContext": true,
  "apiURL": "wss://54.123.45.67/agent",
  "agentID": "server-01",
  "hasSecret": true,
  "hasConnection": true,
  "credentialsAvailable": true,
  "canStart": true
}
```

### View WebSocket Logs

All WebSocket operations are logged with the `[ws]` prefix:

```bash
# Real-time logs
sudo journalctl -u jetcamer-agent -f | grep '\[ws\]'

# Recent logs
sudo journalctl -u jetcamer-agent --no-pager -n 100 | grep '\[ws\]'
```

### Debug Script

Run the comprehensive debug script:

```bash
./scripts/debug-websocket.sh
```

This script checks:
- WebSocket client status
- AWS credentials availability
- Public IP detection
- Connection readiness

### Common Log Messages

- `[ws] connecting to ...` - Connection attempt
- `[ws] ✓ connected successfully` - Connection established
- `[ws] sending auth message` - Authentication in progress
- `[ws] ✓ auth message sent successfully` - Authenticated
- `[ws] metrics sent: cpu=...` - Metrics transmission
- `[ws] heartbeat sent` - Heartbeat transmission
- `[ws] received message: type=...` - Message received
- `[ws] executing command: ...` - Command execution
- `[ws] connection failed: ...` - Connection error

## Testing

### Test Agent Connection

1. **Check if WebSocket is running:**
   ```bash
   curl http://127.0.0.1:9811/internal/ws-status
   ```

2. **Verify credentials are available:**
   ```bash
   curl http://127.0.0.1:9811/internal/s3-validate
   ```

3. **Check agent logs:**
   ```bash
   sudo journalctl -u jetcamer-agent -f | grep '\[ws\]'
   ```

4. **Verify connection on server:**
   - Check server logs for agent authentication
   - Verify metrics are being received every 5 seconds
   - Check heartbeats every 30 seconds

### Test Command Execution

From your server, send a test command:

```typescript
// Send ping command
sendCommand('your-agent-id', 'ping');

// Check for response in command_result messages
```

The agent will respond with a `command_result` message.

## Security Considerations

- **Shared secret**: Use a strong, unique secret per agent or tenant
- **TLS required**: Always use `wss://` (not `ws://`) in production
- **Message validation**: Server must verify HMAC signatures
- **Replay protection**: Consider checking `ts` (timestamp) and `nonce` for replay attacks
- **Rate limiting**: Implement rate limiting on the server side

## Troubleshooting

### WebSocket client not starting

**Symptoms:** Status shows `"started": false`

**Solutions:**
1. Check status endpoint: `curl http://127.0.0.1:9811/internal/ws-status`
2. Look for `"missing"` field to identify what's needed:
   - `"missing": "secret"` → Set AWS credentials via `/internal/set-aws-config`
   - `"missing": "apiURL"` → Ensure EC2 metadata is accessible or set `wsApiUrl` manually
3. Check agent logs: `sudo journalctl -u jetcamer-agent | grep '\[ws\]'`
4. Verify credentials: `curl http://127.0.0.1:9811/internal/s3-validate`

### Connection failures

**Symptoms:** Logs show `[ws] connection failed`

**Solutions:**
1. Verify the WebSocket URL is correct:
   ```bash
   curl http://127.0.0.1:9811/internal/ws-status | jq '.apiURL'
   ```
2. Check if server is listening on the expected IP and port
3. Verify firewall rules (outbound connections should be allowed)
4. Ensure TLS certificate is valid (for `wss://`)
5. Check server logs for authentication errors
6. Verify the server is accessible from the agent's network

### No metrics received on server

**Symptoms:** Server receives auth but no metrics

**Solutions:**
1. Check agent logs for `[ws] metrics sent` messages
2. Verify connection is still active (check for heartbeats)
3. Check server logs for message processing errors
4. Verify HMAC signature verification is working correctly

### Commands not executing

**Symptoms:** Commands sent but no response

**Solutions:**
1. Verify HMAC signature verification on server
2. Check agent logs for `[ws] executing command` messages
3. Ensure command name matches supported commands (see list above)
4. Check for `[ws] command result` in agent logs
5. Verify the agent is still connected (check heartbeats)

### Auto-start not working

**Symptoms:** Credentials added but WebSocket doesn't start

**Solutions:**
1. WebSocket auto-starts when credentials are set via `/internal/set-aws-config`
2. If credentials are set via environment variables, restart the agent
3. Check monitoring is active: `curl http://127.0.0.1:9811/internal/ws-status`
4. Wait up to 10 seconds (monitoring interval) for auto-start
5. Manually trigger: The status endpoint will show when credentials become available

## Example Config

**Minimal config** (WebSocket auto-configured):

```json
{
  "logPaths": ["/var/log/apache2/access.log"],
  "webListen": "127.0.0.1:9811",
  "instanceId": "server-01",
  "siteId": "production"
}
```

The agent will automatically:
- Detect public IP from EC2 metadata → `wss://<public-ip>/agent`
- Use AWS secret key from stored credentials or environment → `wsSecret`

**Manual override** (if needed):

```json
{
  "logPaths": ["/var/log/apache2/access.log"],
  "webListen": "127.0.0.1:9811",
  "instanceId": "server-01",
  "siteId": "production",
  "wsApiUrl": "wss://api.jetcamer.com/agent",
  "wsSecret": "custom-secret-key"
}
```

