# Agent HTTP API Integration

This document describes how the hosting control panel integrates with the JetCamer Agent's HTTP API for web hosting and FTP management.

## Overview

The agent now handles most web hosting tasks directly via HTTP API (port 9811) instead of using SSM, which provides better performance and faster response times.

**Key Changes:**
- All FTP operations now use the agent's HTTP API instead of SSM
- Domain hosting check: Domains not hosted on the instance (A record doesn't match instance IP) are read-only
- Agent API base URL: `http://<agent-ip>:9811`

## Domain Hosting Check

Before performing any write operations (create, update, delete), the system checks if the domain is hosted on the instance by:

1. Getting the instance's public IP address
2. Looking up the domain's A records via Route53
3. Checking if any A record points to the instance IP

**Implementation:**
- `AgentHttpService.isDomainHostedOnInstance(domain, instanceId)` performs this check
- Returns `true` if domain is hosted, `false` otherwise
- For read-only domains, list operations return empty data
- Write operations throw `BadRequestError` with message: "Domain is not hosted on this instance. FTP operations are read-only for external domains."

## FTP API Endpoints

All FTP endpoints are now proxied through the control panel API to the agent's HTTP API.

### Server Management

#### GET `/domains/ftp/server/status`
- **Query Params**: `instanceId` (required)
- **Agent Endpoint**: `GET http://<agent-ip>:9811/domains/ftp/server/status`
- **Response**: Returns FTP server status (vsftpd installed/running, version, ports, config path)

#### POST `/domains/ftp/server/install`
- **Query Params**: `instanceId` (required)
- **Body**: `{ port?, configureFirewall?, enableTLS?, passivePorts? }`
- **Agent Endpoint**: `POST http://<agent-ip>:9811/domains/ftp/server/install`
- **Response**: `{ commandId, status }` - Installation is asynchronous

#### GET `/domains/ftp/server/installation/:commandId`
- **Query Params**: `instanceId` (required)
- **Agent Endpoint**: `GET http://<agent-ip>:9811/domains/ftp/server/installation/:commandId`
- **Response**: Installation status (`InProgress`, `Success`, or `Failed`)

#### POST `/domains/ftp/server/uninstall`
- **Query Params**: `instanceId` (required)
- **Body**: `{ removeConfig?: boolean }`
- **Agent Endpoint**: `POST http://<agent-ip>:9811/domains/ftp/server/uninstall`
- **Response**: `{ commandId, status }` - Uninstallation is asynchronous

### Account Management

#### GET `/domains/ftp/accounts`
- **Query Params**: `domain` (required), `instanceId` (required)
- **Agent Endpoint**: `GET http://<agent-ip>:9811/domains/ftp/accounts?domain={domain}`
- **Read-Only Behavior**: If domain is not hosted on instance, returns empty accounts list
- **Response**: `{ accounts: FtpAccount[], domain, serverType, serverInstalled, serverRunning }`

#### GET `/domains/ftp/accounts/:username`
- **Query Params**: `instanceId` (required)
- **Path Params**: `username` (format: `localUsername@domain`)
- **Agent Endpoint**: `GET http://<agent-ip>:9811/domains/ftp/accounts/:username`
- **Read-Only Behavior**: Throws error if domain is not hosted on instance
- **Response**: `{ account: FtpAccount }`

#### POST `/domains/ftp/accounts`
- **Query Params**: `instanceId` (required)
- **Body**: `{ localUsername, password, domain, homeDirectory?, uploadBandwidth?, downloadBandwidth?, maxConnections?, chroot? }`
- **Agent Endpoint**: `POST http://<agent-ip>:9811/domains/ftp/accounts`
- **Read-Only Behavior**: Throws error if domain is not hosted on instance
- **Response**: `{ account: FtpAccount, commandId }`

#### PUT `/domains/ftp/accounts/:username`
- **Query Params**: `instanceId` (required)
- **Path Params**: `username` (format: `localUsername@domain`)
- **Body**: `{ password?, homeDirectory?, enabled?, uploadBandwidth?, downloadBandwidth? }`
- **Agent Endpoint**: `PUT http://<agent-ip>:9811/domains/ftp/accounts/:username`
- **Read-Only Behavior**: Throws error if domain is not hosted on instance
- **Response**: `{ account: FtpAccount, commandId }`

#### DELETE `/domains/ftp/accounts/:username`
- **Query Params**: `instanceId` (required)
- **Path Params**: `username` (format: `localUsername@domain`)
- **Agent Endpoint**: `DELETE http://<agent-ip>:9811/domains/ftp/accounts/:username`
- **Read-Only Behavior**: Throws error if domain is not hosted on instance
- **Response**: `{ success: boolean, message: string }`

#### POST `/domains/ftp/accounts/:username/test`
- **Query Params**: `instanceId` (required)
- **Path Params**: `username` (format: `localUsername@domain`)
- **Body**: `{ password: string }`
- **Agent Endpoint**: `POST http://<agent-ip>:9811/domains/ftp/accounts/:username/test`
- **Read-Only Behavior**: Throws error if domain is not hosted on instance
- **Response**: `{ success: boolean, message: string, connectionTime?, publicIp?, ftpPort? }`

## Implementation Details

### AgentHttpService

The `AgentHttpService` class handles all communication with the agent's HTTP API:

```typescript
class AgentHttpService {
  // Check if domain is hosted on instance
  async isDomainHostedOnInstance(domain: string, instanceId?: string): Promise<boolean>
  
  // FTP Server Management
  async getFtpServerStatus(instanceId?: string): Promise<FtpServerStatus>
  async installFtpServer(instanceId: string, config: FtpInstallRequest): Promise<FtpInstallResponse>
  async getFtpInstallationStatus(instanceId: string, commandId: string): Promise<InstallationStatus>
  async uninstallFtpServer(instanceId: string, removeConfig?: boolean): Promise<FtpInstallResponse>
  
  // FTP Account Management
  async listFtpAccounts(instanceId: string, domain: string): Promise<FtpAccountListResponse>
  async getFtpAccount(instanceId: string, username: string): Promise<{ account: FtpAccount }>
  async createFtpAccount(instanceId: string, account: FtpAccountCreateRequest): Promise<FtpAccountCreateResponse>
  async updateFtpAccount(instanceId: string, username: string, updates: FtpAccountUpdateRequest): Promise<{ account: FtpAccount; commandId: string }>
  async deleteFtpAccount(instanceId: string, username: string): Promise<{ success: boolean; message: string }>
  async testFtpAccount(instanceId: string, username: string, password: string): Promise<FtpAccountTestResponse>
}
```

### Error Handling

All agent HTTP requests:
- Timeout after 30 seconds
- Handle connection errors gracefully
- Return agent error messages in response
- Log all errors for debugging

### Domain Hosting Validation

The system extracts the domain from FTP usernames (format: `localUsername@domain`) and validates hosting status before allowing write operations:

```typescript
// Extract domain from username
const domainMatch = username.match(/@(.+)$/);
if (!domainMatch) {
  throw new BadRequestError('Invalid username format. Expected: localUsername@domain');
}
const domain = domainMatch[1];

// Check if domain is hosted on instance
const isHosted = await agentHttpService.isDomainHostedOnInstance(domain, instanceId);
if (!isHosted) {
  throw new BadRequestError('Domain is not hosted on this instance. FTP operations are read-only for external domains.');
}
```

## Migration from SSM

The previous implementation used SSM to execute shell commands on the instance. The new implementation:

1. **Removes SSM dependency** for FTP operations (SSM still used for other operations)
2. **Uses direct HTTP calls** to the agent API (faster, more reliable)
3. **Adds domain hosting validation** to enforce read-only for external domains
4. **Maintains same API structure** for backward compatibility

## Testing

To test the integration:

1. Ensure agent is running on port 9811
2. Verify instance has public IP address
3. Create a domain with A record pointing to instance IP
4. Test FTP server installation
5. Test FTP account creation/update/delete
6. Test with external domain (should be read-only)

## Related Documentation

- [Web Hosting API Documentation](../agent-api-spec.md) - Full agent API specification
- [FTP SSM Implementation](./ftp-ssm-implementation.md) - Legacy SSM-based implementation (for reference)

