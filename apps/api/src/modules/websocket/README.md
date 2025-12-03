# WebSocket Agent Communication

This module provides WebSocket support as an alternative to SSM for agent communication. Agents connect outbound to the API server, making it NAT-friendly and eliminating the need for SSM in many cases.

## Architecture

- **Outbound connections**: Agents initiate WebSocket connections to `wss://api.yourdomain.com/agent`
- **Message protocol**: JSON messages with HMAC-SHA256 signatures for authentication and integrity
- **Real-time**: Low-latency bidirectional communication (milliseconds vs seconds with SSM)

## Message Protocol

All messages follow this envelope format:

```typescript
{
  type: "auth" | "metrics" | "log" | "command" | "command_result" | "heartbeat",
  agentId: string,
  ts: number,        // Unix timestamp in milliseconds
  nonce: string,     // UUID for replay protection
  payload: any,      // Type-specific payload
  signature: string  // HMAC-SHA256 hex signature
}
```

### Message Types

- **auth**: Initial authentication message from agent
- **metrics**: System metrics (CPU, memory, disk, etc.)
- **log**: Log entries from the agent
- **command**: Command sent from server to agent
- **command_result**: Result of a command execution
- **heartbeat**: Keep-alive message

## Agent Secret

Agent secrets use the **AWS secret access key** directly. This ensures everything works out of the box without additional configuration.

The WebSocket configuration is automatically generated using:
- **WebSocket URL**: `wss://{instance_public_ip}/agent`
- **Secret**: AWS secret access key from server settings

## API Endpoints

### HTTP Endpoints

- `GET /api/websocket/agents` - List all connected agents
- `GET /api/websocket/agents/:agentId` - Check if an agent is connected
- `POST /api/websocket/agents/:agentId/command` - Send a command to an agent

### WebSocket Endpoint

- `wss://{instance_public_ip}/agent` - Uses the instance's public IP address

## Usage Example

### Send a command to an agent

```bash
curl -X POST http://localhost:4000/api/websocket/agents/agent-123/command \
  -H "Content-Type: application/json" \
  -d '{"command": "ping", "args": {}}'
```

### Check connected agents

```bash
curl http://localhost:4000/api/websocket/agents
```

## Integration with Existing Code

This WebSocket module is **additive** and does not modify or break existing SSM-based functionality. Both can coexist:

- **SSM**: Still available for agents that don't support WebSocket
- **WebSocket**: New alternative for real-time communication

The monitoring module can use either method depending on agent capabilities.

## Security

- **HMAC signatures**: All messages are signed and verified using the AWS secret access key
- **Timestamp validation**: Prevents replay attacks (5-minute window)
- **Nonce**: Additional replay protection
- **Agent authentication**: Each agent must authenticate with the AWS secret access key
- **Outbound connections**: Agents connect outbound to the API, no inbound ports needed

## Out of the Box

This implementation works **out of the box** with no additional configuration:

1. **WebSocket URL**: Agent constructs `wss://{instance_public_ip}/agent` using the IP it already knows
2. **Secret**: Uses the AWS secret access key already configured in server settings
3. **No extra setup**: Just configure AWS credentials and the agent can connect!

The agent already has:
- The instance public IP (from EC2 metadata or dashboard)
- The AWS secret key (from server settings)

So it can directly construct:
```json
{
  "wsApiUrl": "wss://{public_ip}/agent",
  "wsSecret": "{aws-secret-key}"
}
```

