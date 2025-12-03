# MongoDB Usage Summary

This document provides a comprehensive overview of how MongoDB is currently used in the Hosting Control Panel API.

## Connection Management

MongoDB connection is managed through a singleton pattern in `apps/api/src/config/mongo.ts`:

- **Connection**: Uses `MongoClient` from the `mongodb` package
- **Connection String**: Configured via `MONGODB_URI` environment variable
- **Database**: Uses the default database from the connection string
- **Connection Lifecycle**: 
  - Lazy connection on first use
  - Automatic reconnection on connection loss
  - Connection health checks via ping
  - Graceful shutdown on application exit

## Collections and Data Models

The application uses the following MongoDB collections:

### 1. **hosting_plans** (`PLAN_COLLECTION`)
- **Purpose**: Stores hosting plan templates with resource limits
- **Repository**: `MongoAccountsRepository`
- **Indexes**: 
  - `name` (unique)
- **Key Fields**:
  - `name`, `description`
  - `diskQuotaMb`, `bandwidthQuotaGb`
  - `maxDomains`, `maxDatabases`, `maxEmailAccounts`
  - `priceMonthly`
  - `createdAt`, `updatedAt`

### 2. **hosting_accounts** (`ACCOUNT_COLLECTION`)
- **Purpose**: Stores hosting account information and metadata
- **Repository**: `MongoAccountsRepository`
- **Indexes**:
  - `username` (unique)
  - `ownerId`
  - `status`
- **Key Fields**:
  - `username`, `ownerId`, `planId`
  - `status` (active, suspended, etc.)
  - `metadata` (flexible JSON object)
  - `createdAt`, `updatedAt`

### 3. **firewall_rules** (`COLLECTION`)
- **Purpose**: Stores firewall rule definitions and sync status
- **Repository**: `MongoFirewallRepository`
- **Indexes**:
  - `direction`, `protocol`, `portRange`, `source`, `destination` (compound)
  - `syncStatus`
- **Key Fields**:
  - `name`, `description`
  - `direction` (ingress/egress)
  - `protocol`, `portRange`, `source`, `destination`
  - `action` (allow/deny)
  - `status` (enabled/disabled)
  - `syncStatus` (pending/synced/failed)
  - `lastSyncAt`, `syncError`
  - `createdAt`, `updatedAt`

### 4. **firewall_settings** (`COLLECTION`)
- **Purpose**: Stores firewall configuration (AWS Security Group ID, Network ACL ID, credentials)
- **Repository**: `MongoFirewallSettingsRepository`
- **Key Fields**:
  - `securityGroupId`, `networkAclId`
  - `awsAccessKeyId`, `awsSecretAccessKey`
  - `updatedAt`

### 5. **server_settings** (`COLLECTION`)
- **Purpose**: Stores global server settings (AWS credentials, region, server name)
- **Repository**: `MongoServerSettingsRepository`
- **Special**: Uses a fixed ObjectId (`000000000000000000000002`) for singleton pattern
- **Key Fields**:
  - `name` (server name)
  - `awsRegion`
  - `awsAccessKeyIdEncrypted` (encrypted)
  - `awsSecretAccessKeyEncrypted` (encrypted)
  - `updatedAt`

### 6. **database_credentials** (`COLLECTION`)
- **Purpose**: Stores encrypted database credentials for RDS/local database connections
- **Repository**: `MongoDatabaseCredentialsRepository`
- **Key Fields**:
  - `databaseId`, `username`
  - `passwordEncrypted` (encrypted)
  - `host`, `port`
  - `readReplicaHost`, `readReplicaPort` (optional)
  - `engine` (mysql, postgres, etc.)
  - `createdAt`, `updatedAt`

### 7. **monitoring_heartbeats** (`HEARTBEATS_COLLECTION`)
- **Purpose**: Stores agent heartbeat data from EC2 instances
- **Repository**: `MongoMonitoringRepository`
- **Indexes**:
  - `instanceId`, `timestamp` (compound, TTL index on timestamp)
  - `instanceId`, `lastSeen` (compound)
- **Key Fields**:
  - `instanceId`, `version`
  - `timestamp`, `lastSeen`
  - `metrics` (SystemMetrics object)
  - `blockedIps` (array)
  - `status` (online/offline)
  - `createdAt`, `updatedAt`

### 8. **monitoring_log_events** (`LOG_EVENTS_COLLECTION`)
- **Purpose**: Stores parsed log events from web server access logs
- **Repository**: `MongoMonitoringRepository`
- **Indexes**:
  - `instanceId`, `timestamp` (compound, TTL index on timestamp)
  - `ip`, `timestamp` (compound)
- **Key Fields**:
  - `instanceId`, `timestamp`
  - `ip`, `path`, `status`, `method`
  - `userAgent`, `raw` (raw log line)
  - `createdAt`

### 9. **monitoring_agent_configs** (`AGENT_CONFIGS_COLLECTION`)
- **Purpose**: Stores agent configuration per instance
- **Repository**: `MongoMonitoringRepository`
- **Indexes**:
  - `instanceId` (unique)
- **Key Fields**:
  - `instanceId`
  - `dashboardUrl`, `logPaths`
  - `tailFormat` (apache-clf, nginx, nginx-json)
  - `autoUpdate`, `heartbeatInterval`
  - `requestThreshold`, `blockDurationMinutes`
  - `createdAt`, `updatedAt`

### 10. **ddos_protection** (`COLLECTION`)
- **Purpose**: Stores DDoS protection status and AWS Lambda configuration
- **Repository**: `MongoDDoSProtectionRepository`
- **Indexes**:
  - `instanceId` (unique)
- **Key Fields**:
  - `instanceId`, `securityGroupId`
  - `enabled`
  - `lambdaFunctionName`, `lambdaFunctionArn`
  - `logGroupName`, `roleArn`, `ruleArn`
  - `requestThreshold`, `blockDurationMinutes`
  - `createdAt`, `updatedAt`

### 11. **instance_status** (`COLLECTION`)
- **Purpose**: Caches instance status (web server type, SSM agent status, public IP)
- **Repository**: `MongoInstanceStatusRepository`
- **Indexes**:
  - `instanceId` (unique)
- **Key Fields**:
  - `instanceId`
  - `webServer` (type, version, isRunning)
  - `ssmAgent` (isInstalled, isRunning)
  - `publicIp`
  - `lastChecked`, `lastUpdated`

### 12. **domains** (`COLLECTION`) - **DEPRECATED**
- **Status**: Collection exists but is no longer actively used
- **Note**: Domain listing now comes from Route53 and agent API endpoints
- **Repository**: `MongoDomainRepository` (exists but not instantiated in modules)

## Repository Pattern

All MongoDB access follows a repository pattern:

1. **Interface Definition**: Each module defines a repository interface (e.g., `AccountsRepository`)
2. **MongoDB Implementation**: MongoDB-specific implementation (e.g., `MongoAccountsRepository`)
3. **Dependency Injection**: Repositories are instantiated in module factories and injected into services

### Common Patterns

- **Index Creation**: Indexes are created lazily on first collection access
- **Document Mapping**: Documents are mapped between MongoDB format (`_id: ObjectId`) and domain models
- **Error Handling**: Connection errors are handled gracefully with reconnection logic
- **Type Safety**: TypeScript interfaces ensure type safety for documents

## Data Flow

1. **API Request** → Controller
2. **Controller** → Service (business logic)
3. **Service** → Repository (data access)
4. **Repository** → MongoDB Collection
5. **Response** flows back through the same layers

## Security Considerations

- **Encryption**: Sensitive fields (AWS credentials, database passwords) are encrypted before storage
- **Indexes**: Proper indexing for query performance and uniqueness constraints
- **TTL Indexes**: Used for time-based data expiration (heartbeats, log events)
- **Connection Security**: MongoDB connection string should use authentication and TLS in production

## Performance Optimizations

- **Connection Pooling**: MongoDB driver handles connection pooling automatically
- **Lazy Index Creation**: Indexes created on-demand to avoid startup delays
- **Caching**: Instance status is cached to reduce MongoDB queries
- **TTL Indexes**: Automatic cleanup of old monitoring data

## Migration Notes

- **Domains**: Domain data was migrated from MongoDB to Route53 + Agent API
- **No Active Migrations**: Current schema is stable

## Future Considerations

- Consider adding indexes for frequently queried fields
- Monitor collection sizes and implement archival strategies for old data
- Consider sharding for high-volume collections (monitoring_heartbeats, monitoring_log_events)

