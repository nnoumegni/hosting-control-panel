# Websites (Domains) Page Specification

## Overview

The Websites (Domains) page (`/dashboard/domains`) is a comprehensive domain management interface that allows users to manage web hosting domains on EC2 instances. It provides functionality for:

- Managing domain configurations (Nginx/Apache)
- DNS record management via Route53
- SSL certificate management via Certbot
- Web server installation/uninstallation
- Domain quota monitoring
- Email identity management (SES)
- SSM agent status monitoring

## Architecture

The page is a client-side React component that communicates with a backend API. The backend uses AWS SSM (Systems Manager) to execute commands on EC2 instances, Route53 for DNS management, and various AWS services for infrastructure operations.

## Instance Selection

The page requires an EC2 instance to be selected before it can function. The instance ID is stored in `localStorage` with the key `hosting-control-panel:selected-ec2-instance`.

**Instance ID Format**: Must start with `i-` (e.g., `i-1234567890abcdef0`)

**Event Listeners**:
- `storage` event: Listens for localStorage changes
- `ec2-instance-selected` custom event: Listens for instance selection changes

## API Endpoints

### Base Path
All endpoints are prefixed with `/domains`

---

### 1. Server Information

#### `GET /domains/server-info`

**Description**: Retrieves server information including web server type, version, running status, and all configured domains.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID. If not provided, attempts auto-detection.
- `forceRefresh` (optional, string): If set, bypasses cache and fetches fresh data.

**Response**:
```typescript
{
  instanceId: string;
  webServer: {
    type: 'nginx' | 'apache' | 'none';
    version?: string;
    isRunning: boolean;
  };
  domains: Array<{
    domain: string;
    serverBlock: string;  // nginx server_name or apache ServerName
    documentRoot?: string;
    sslEnabled: boolean;
    sslCertificate?: string;
    configPath: string;
  }>;
  publicIp?: string;
}
```

**Example Response**:
```json
{
  "instanceId": "i-1234567890abcdef0",
  "webServer": {
    "type": "nginx",
    "version": "1.18.0",
    "isRunning": true
  },
  "domains": [
    {
      "domain": "example.com",
      "serverBlock": "example.com www.example.com",
      "documentRoot": "/var/www/example.com",
      "sslEnabled": true,
      "sslCertificate": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "configPath": "/etc/nginx/sites-available/example.com"
    }
  ],
  "publicIp": "203.0.113.1"
}
```

**Caching**: The endpoint uses cached data from the database when available (unless `forceRefresh` is set). Fresh data is fetched in the background.

---

### 2. Domain Quota

#### `GET /domains/quota/:domain`

**Description**: Retrieves disk usage/quota for a specific domain's document root.

**Path Parameters**:
- `domain` (string): Domain name

**Query Parameters**:
- `documentRoot` (optional, string): Document root path. If not provided, defaults to `/var/www/{domain}`
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  domain: string;
  used: number;  // bytes
  limit?: number;  // bytes (not currently returned)
  percentage?: number;  // (not currently returned)
}
```

**Example Response**:
```json
{
  "domain": "example.com",
  "used": 1073741824
}
```

---

### 3. DNS Management

#### `GET /domains/dns/zones`

**Description**: Lists all Route53 hosted zones.

**Response**:
```typescript
{
  zones: Array<{
    id: string;
    name: string;
    recordCount: number;
    privateZone: boolean;
  }>;
}
```

**Example Response**:
```json
{
  "zones": [
    {
      "id": "Z1234567890ABC",
      "name": "example.com",
      "recordCount": 5,
      "privateZone": false
    }
  ]
}
```

---

#### `GET /domains/dns/records/:domain`

**Description**: Retrieves all DNS records for a domain from Route53. If no Route53 hosted zone is found, falls back to public DNS lookup via external API.

**Path Parameters**:
- `domain` (string): Domain name

**Response**:
```typescript
{
  zoneId: string;
  zoneName: string;
  records: Array<{
    name: string;
    type: string;  // A, AAAA, MX, TXT, CNAME, NS, SOA
    ttl?: number;
    values: string[];
  }>;
}
```

**Example Response**:
```json
{
  "zoneId": "Z1234567890ABC",
  "zoneName": "example.com",
  "records": [
    {
      "name": "example.com",
      "type": "A",
      "ttl": 300,
      "values": ["203.0.113.1"]
    },
    {
      "name": "www.example.com",
      "type": "A",
      "ttl": 300,
      "values": ["203.0.113.1"]
    }
  ]
}
```

**Fallback Behavior**: If no Route53 hosted zone exists, the endpoint queries an external DNS API (`https://api.jetcamer.com`) to fetch public DNS records for A, AAAA, MX, TXT, CNAME, NS, and SOA record types.

---

#### `POST /domains/dns/zones/:zoneId/records`

**Description**: Creates or updates a DNS record in a Route53 hosted zone.

**Path Parameters**:
- `zoneId` (string): Route53 hosted zone ID

**Request Body**:
```typescript
{
  name: string;  // Record name (e.g., "example.com" or "www.example.com")
  type: string;  // Record type (A, AAAA, MX, TXT, CNAME, etc.)
  ttl: number;  // Time to live in seconds
  values: string[];  // Array of record values
}
```

**Example Request**:
```json
{
  "name": "subdomain.example.com",
  "type": "A",
  "ttl": 300,
  "values": ["203.0.113.2"]
}
```

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

---

#### `DELETE /domains/dns/zones/:zoneId/records/:recordName/:recordType`

**Description**: Deletes a DNS record from a Route53 hosted zone.

**Path Parameters**:
- `zoneId` (string): Route53 hosted zone ID
- `recordName` (string): Record name
- `recordType` (string): Record type (A, AAAA, etc.)

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

---

### 4. SSL Certificate Management

#### `GET /domains/ssl/certificates`

**Description**: Lists all SSL certificates managed by Certbot on the instance.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Filter certificates by domain (exact or wildcard match)

**Response**:
```typescript
{
  certificates: Array<{
    domain: string;
    certificatePath: string;
    keyPath: string;
    chainPath?: string;
    expiryDate?: string;  // ISO date string
    daysUntilExpiry?: number;
    issuer?: string;
    isWildcard: boolean;
  }>;
}
```

**Example Response**:
```json
{
  "certificates": [
    {
      "domain": "example.com",
      "certificatePath": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "keyPath": "/etc/letsencrypt/live/example.com/privkey.pem",
      "chainPath": "/etc/letsencrypt/live/example.com/chain.pem",
      "expiryDate": "2025-12-01",
      "daysUntilExpiry": 45,
      "issuer": "Let's Encrypt",
      "isWildcard": false
    }
  ]
}
```

**Error Responses**:
- `400`: AWS credentials not configured or EC2 instance ID not found
- `500`: Failed to list certificates

---

#### `POST /domains/ssl/certificates/:domain`

**Description**: Requests a new SSL certificate using Certbot.

**Path Parameters**:
- `domain` (string): Domain name

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Request Body**:
```typescript
{
  email?: string;  // Email for Let's Encrypt notifications
  wildcard?: boolean;  // Request wildcard certificate (*.domain)
  dnsChallenge?: boolean;  // Use DNS challenge (required for wildcard)
  webroot?: string;  // Webroot path for HTTP challenge
}
```

**Example Request**:
```json
{
  "email": "admin@example.com",
  "wildcard": false,
  "dnsChallenge": false,
  "webroot": "/var/www/example.com"
}
```

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

**Note**: Wildcard certificates require DNS challenge (`dnsChallenge: true`).

---

#### `POST /domains/ssl/certificates/renew`

**Description**: Renews all SSL certificates managed by Certbot.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

---

#### `DELETE /domains/ssl/certificates/:domain`

**Description**: Deletes an SSL certificate.

**Path Parameters**:
- `domain` (string): Domain name (certificate name)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  success: true;
  message: string;
}
```

---

### 5. SSM Agent Management

#### `GET /domains/ssm-agent/status`

**Description**: Checks if SSM agent is installed and running on the instance.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `forceRefresh` (optional, string): Bypass cache

**Response**:
```typescript
{
  isInstalled: boolean;
  isRunning: boolean;
  installationInProgress?: boolean;
  installationCommandId?: string;
}
```

**Example Response**:
```json
{
  "isInstalled": true,
  "isRunning": true
}
```

**Caching**: Uses cached status from database unless `forceRefresh` is set.

---

#### `POST /domains/ssm-agent/install`

**Description**: Installs or updates SSM agent on the instance. **Note**: This only works if SSM agent is already partially installed. For completely missing agents, installation must be done via EC2 user-data, EC2 Instance Connect, or SSH.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  commandId: string;
  status: string;  // "InProgress"
}
```

**Error Conditions**:
- Instance not found in EC2
- Instance not in "running" state
- Instance not registered with SSM (agent not installed)
- Missing IAM role with `AmazonSSMManagedInstanceCore` policy

---

#### `POST /domains/ssm-agent/start`

**Description**: Starts the SSM agent if it's installed but not running.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  commandId: string;  // "NONE" if already running
  status: string;  // "InProgress" or "AlreadyRunning"
}
```

---

#### `GET /domains/ssm-agent/installation/:commandId`

**Description**: Checks the status of an SSM agent installation/start command.

**Path Parameters**:
- `commandId` (string): SSM command ID

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  status: string;  // "Success", "Failed", "Cancelled", "TimedOut", "InProgress", "Pending"
  output?: string;  // Command output
  error?: string;  // Error message if failed
}
```

**Example Response**:
```json
{
  "status": "Success",
  "output": "SSM_AGENT_INSTALLED_AND_RUNNING\nSSM Agent installation/update complete."
}
```

---

### 6. Web Server Management

#### `POST /domains/web-server/install`

**Description**: Installs Nginx or Apache web server on the instance.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Request Body**:
```typescript
{
  type: 'nginx' | 'apache';
  httpPort: number;  // HTTP port (default: 80)
  httpsPort: number;  // HTTPS port (default: 443)
  phpVersion?: string;  // PHP version to install (e.g., "8.1")
  extras?: string;  // Space-separated list of additional packages
  configureFirewall: boolean;  // Whether to configure firewall rules
}
```

**Example Request**:
```json
{
  "type": "nginx",
  "httpPort": 80,
  "httpsPort": 443,
  "phpVersion": "8.1",
  "extras": "curl wget",
  "configureFirewall": true
}
```

**Response**:
```typescript
{
  commandId: string;
  status: string;  // "InProgress"
}
```

**Timeout**: 10 minutes (600 seconds)

---

#### `GET /domains/web-server/installation/:commandId`

**Description**: Checks the status of a web server installation command.

**Path Parameters**:
- `commandId` (string): SSM command ID

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  status: string;  // "Success", "Failed", "Cancelled", "TimedOut", "InProgress", "Pending"
  output?: string;  // Command output (last line used for progress display)
  error?: string;  // Error message if failed
}
```

---

#### `POST /domains/web-server/uninstall`

**Description**: Uninstalls Nginx or Apache web server from the instance.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Request Body**:
```typescript
{
  type: 'nginx' | 'apache';
}
```

**Response**:
```typescript
{
  commandId: string;
  status: string;  // "InProgress"
}
```

---

#### `GET /domains/web-server/uninstallation/:commandId`

**Description**: Checks the status of a web server uninstallation command.

**Path Parameters**:
- `commandId` (string): SSM command ID

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  status: string;
  output?: string;
  error?: string;
}
```

---

### 7. Domain CRUD Operations

#### `POST /domains/domains`

**Description**: Creates a new domain configuration. This operation:
1. Creates a Route53 hosted zone
2. Creates A records for the domain and www subdomain
3. Creates web server configuration (Nginx/Apache)
4. Saves domain metadata to database

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID (required in practice)

**Request Body**:
```typescript
{
  domain: string;  // Domain name (required)
  documentRoot?: string;  // Document root path (default: /var/www/{domain})
  sslEnabled?: boolean;  // Whether SSL is enabled (default: false)
}
```

**Example Request**:
```json
{
  "domain": "example.com",
  "documentRoot": "/var/www/example.com",
  "sslEnabled": false
}
```

**Response**:
```typescript
{
  domain: {
    _id: string;
    domain: string;
    instanceId: string;
    hostedZoneId: string;
    publicIp: string;
    documentRoot: string;
    webServerType: 'nginx' | 'apache';
    configPath: string;
    sslEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
  commandId: string;  // SSM command ID for web server config creation
}
```

**Error Conditions**:
- Domain already exists
- No web server installed
- EC2 instance has no public IP
- AWS credentials not configured

---

#### `GET /domains/domains`

**Description**: Lists all managed domains.

**Query Parameters**:
- `instanceId` (optional, string): Filter domains by instance ID

**Response**:
```typescript
{
  domains: Array<{
    _id: string;
    domain: string;
    instanceId: string;
    hostedZoneId: string;
    publicIp: string;
    documentRoot: string;
    webServerType: 'nginx' | 'apache';
    configPath: string;
    sslEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

---

#### `GET /domains/domains/:idOrDomain`

**Description**: Retrieves a specific domain by ID or domain name.

**Path Parameters**:
- `idOrDomain` (string): Domain ID or domain name

**Response**:
```typescript
{
  domain: {
    _id: string;
    domain: string;
    instanceId: string;
    hostedZoneId: string;
    publicIp: string;
    documentRoot: string;
    webServerType: 'nginx' | 'apache';
    configPath: string;
    sslEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
}
```

**Error Response**:
- `404`: Domain not found

---

#### `PUT /domains/domains/:idOrDomain`

**Description**: Updates a domain configuration.

**Path Parameters**:
- `idOrDomain` (string): Domain ID or domain name

**Request Body**:
```typescript
{
  documentRoot?: string;
  sslEnabled?: boolean;
  sslCertificatePath?: string;
}
```

**Response**:
```typescript
{
  domain: {
    // Same structure as GET response
  };
}
```

**Note**: If `documentRoot` or `sslEnabled` changes, the web server configuration is automatically regenerated.

---

#### `DELETE /domains/domains/:idOrDomain`

**Description**: Deletes a domain. This operation:
1. Deletes web server configuration
2. Deletes DNS A records (domain and www)
3. Deletes Route53 hosted zone
4. Removes domain from database

**Path Parameters**:
- `idOrDomain` (string): Domain ID or domain name

**Response**:
```typescript
{
  success: true;
  message: string;
  commandId: string;  // SSM command ID for web server config deletion
}
```

---

### 8. Email Identity (SES)

**Note**: The email identity endpoints are part of the Email module, not the Domains module, but are used by the Domains page.

#### `GET /email/identities`

**Description**: Lists SES email identities filtered by domain.

**Query Parameters**:
- `domain` (string): Filter identities by domain

**Response**:
```typescript
{
  identities: Array<{
    email: string;
    domain: string;
    status: string;  // "Verified", "Pending", "Failed"
  }>;
}
```

**Example Response**:
```json
{
  "identities": [
    {
      "email": "admin@example.com",
      "domain": "example.com",
      "status": "Verified"
    }
  ]
}
```

---

### 9. FTP Account Management

**Note**: FTP endpoints are part of the Domains module and manage FTP user accounts on the EC2 instance. Supports common FTP servers: vsftpd, proftpd, and pure-ftpd.

**Important**: All FTP accounts are strictly scoped to a domain. Usernames are automatically namespaced with `@domain` format (e.g., `user@example.com`) to prevent collisions across domains.

#### `GET /domains/ftp/accounts`

**Description**: Lists all FTP accounts for a specific domain. Domain is required.

**Query Parameters**:
- `domain` (required, string): Domain name to list accounts for
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  accounts: Array<{
    username: string;  // Full username with @domain (e.g., "user@example.com")
    localUsername: string;  // Local username part (e.g., "user")
    domain: string;  // Domain name (required)
    homeDirectory: string;  // Absolute path to FTP home directory
    enabled: boolean;  // Whether account is active
    createdAt?: string;  // ISO date string
    lastLogin?: string;  // ISO date string of last login
    serverType?: 'vsftpd' | 'proftpd' | 'pure-ftpd';  // Detected FTP server type
  }>;
  domain: string;  // The domain these accounts belong to
  serverType?: 'vsftpd' | 'proftpd' | 'pure-ftpd' | 'none';  // Detected FTP server
  serverInstalled: boolean;
  serverRunning: boolean;
}
```

**Example Response**:
```json
{
  "accounts": [
    {
      "username": "admin@example.com",
      "localUsername": "admin",
      "domain": "example.com",
      "homeDirectory": "/var/www/example.com",
      "enabled": true,
      "createdAt": "2025-01-15T10:30:00Z",
      "lastLogin": "2025-01-20T14:22:00Z",
      "serverType": "vsftpd"
    }
  ],
  "domain": "example.com",
  "serverType": "vsftpd",
  "serverInstalled": true,
  "serverRunning": true
}
```

**Error Responses**:
- `400`: Domain parameter is required, AWS credentials not configured, or EC2 instance ID not found
- `500`: Failed to list FTP accounts

---

#### `POST /domains/ftp/accounts`

**Description**: Creates a new FTP account for a specific domain. The username is automatically namespaced with `@domain` to prevent collisions. The account is created as a system user with the specified home directory.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID (required in practice)

**Request Body**:
```typescript
{
  localUsername: string;  // Local username part (without @domain) - alphanumeric, underscores, hyphens only
  password: string;  // FTP password (min 8 characters)
  domain: string;  // Domain name (required) - must match selected domain
  homeDirectory?: string;  // Absolute path to home directory (default: /var/www/{domain})
  shell?: string;  // User shell (default: /usr/sbin/nologin or /sbin/nologin)
  uid?: number;  // User ID (auto-assigned if not provided)
  gid?: number;  // Group ID (default: www-data or apache group)
  chroot?: boolean;  // Whether to chroot user to home directory (default: true)
  uploadBandwidth?: number;  // Upload bandwidth limit in KB/s (optional)
  downloadBandwidth?: number;  // Download bandwidth limit in KB/s (optional)
  maxConnections?: number;  // Maximum concurrent connections (optional)
}
```

**Example Request**:
```json
{
  "localUsername": "admin",
  "password": "SecurePassword123!",
  "domain": "example.com",
  "homeDirectory": "/var/www/example.com",
  "chroot": true,
  "uploadBandwidth": 1024,
  "downloadBandwidth": 2048,
  "maxConnections": 5
}
```

**Note**: The system will automatically create the full username as `admin@example.com`. The system username (for `/etc/passwd`) will be sanitized (e.g., `admin_example_com` or similar) since system usernames cannot contain `@` symbols.

**Response**:
```typescript
{
  account: {
    username: string;  // Full username with @domain (e.g., "admin@example.com")
    localUsername: string;  // Local username part (e.g., "admin")
    domain: string;  // Domain name
    homeDirectory: string;
    enabled: boolean;
    createdAt: string;
    serverType: 'vsftpd' | 'proftpd' | 'pure-ftpd';
  };
  commandId: string;  // SSM command ID for account creation
}
```

**Example Response**:
```json
{
  "account": {
    "username": "admin@example.com",
    "localUsername": "admin",
    "domain": "example.com",
    "homeDirectory": "/var/www/example.com",
    "enabled": true,
    "createdAt": "2025-01-20T15:30:00Z",
    "serverType": "vsftpd"
  },
  "commandId": "abc123-def456-ghi789"
}
```

**Error Responses**:
- `400`: Domain parameter is required, invalid username format, password too weak, or home directory invalid
- `409`: Username already exists for this domain
- `500`: Failed to create FTP account

**Validation Rules**:
- `localUsername`: 3-32 characters, alphanumeric, underscores, hyphens only (no @ symbols)
- `domain`: Required, must be a valid domain name
- `password`: Minimum 8 characters
- `homeDirectory`: Must be absolute path, typically under `/var/www/{domain}` or domain document root
- Full username format: `{localUsername}@{domain}` (e.g., `admin@example.com`)
- System username: Sanitized version for `/etc/passwd` (e.g., `admin_example_com`)

---

#### `GET /domains/ftp/accounts/:username`

**Description**: Retrieves details for a specific FTP account. Username must be in `localUsername@domain` format.

**Path Parameters**:
- `username` (string): FTP username in format `localUsername@domain` (e.g., `admin@example.com`)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Domain name (for validation - must match username domain)

**Response**:
```typescript
{
  account: {
    username: string;  // Full username with @domain (e.g., "admin@example.com")
    localUsername: string;  // Local username part (e.g., "admin")
    domain: string;  // Domain name (required)
    homeDirectory: string;
    enabled: boolean;
    createdAt?: string;
    lastLogin?: string;
    serverType?: 'vsftpd' | 'proftpd' | 'pure-ftpd';
    uploadBandwidth?: number;
    downloadBandwidth?: number;
    maxConnections?: number;
    uid?: number;
    gid?: number;
  };
}
```

**Example Response**:
```json
{
  "account": {
    "username": "admin@example.com",
    "localUsername": "admin",
    "domain": "example.com",
    "homeDirectory": "/var/www/example.com",
    "enabled": true,
    "createdAt": "2025-01-15T10:30:00Z",
    "lastLogin": "2025-01-20T14:22:00Z",
    "serverType": "vsftpd",
    "uploadBandwidth": 1024,
    "downloadBandwidth": 2048,
    "maxConnections": 5,
    "uid": 1001,
    "gid": 33
  }
}
```

**Error Responses**:
- `400`: Invalid username format (must be `localUsername@domain`)
- `404`: FTP account not found
- `500`: Failed to retrieve account details

---

#### `PUT /domains/ftp/accounts/:username`

**Description**: Updates an existing FTP account. Can update password, home directory, bandwidth limits, and other settings. Username must be in `localUsername@domain` format.

**Path Parameters**:
- `username` (string): FTP username in format `localUsername@domain` (e.g., `admin@example.com`)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Domain name (for validation - must match username domain)

**Request Body**:
```typescript
{
  password?: string;  // New password (min 8 characters)
  homeDirectory?: string;  // New home directory path (must be within domain's document root)
  enabled?: boolean;  // Enable/disable account
  uploadBandwidth?: number;  // Upload bandwidth limit in KB/s
  downloadBandwidth?: number;  // Download bandwidth limit in KB/s
  maxConnections?: number;  // Maximum concurrent connections
  chroot?: boolean;  // Update chroot setting
}
```

**Example Request**:
```json
{
  "password": "NewSecurePassword456!",
  "uploadBandwidth": 2048,
  "downloadBandwidth": 4096,
  "maxConnections": 10
}
```

**Response**:
```typescript
{
  account: {
    username: string;  // Full username with @domain (e.g., "admin@example.com")
    localUsername: string;  // Local username part (e.g., "admin")
    domain: string;  // Domain name
    homeDirectory: string;
    enabled: boolean;
    updatedAt: string;
    serverType: 'vsftpd' | 'proftpd' | 'pure-ftpd';
  };
  commandId: string;  // SSM command ID for account update
}
```

**Error Responses**:
- `400`: Invalid username format (must be `localUsername@domain`) or invalid parameters
- `404`: FTP account not found
- `500`: Failed to update account

---

#### `DELETE /domains/ftp/accounts/:username`

**Description**: Deletes an FTP account. Removes the system user and optionally removes the home directory. Username must be in `localUsername@domain` format.

**Path Parameters**:
- `username` (string): FTP username in format `localUsername@domain` (e.g., `admin@example.com`)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Domain name (for validation - must match username domain)
- `removeHomeDirectory` (optional, boolean): Whether to delete home directory (default: false)

**Response**:
```typescript
{
  success: true;
  message: string;
  commandId: string;  // SSM command ID for account deletion
}
```

**Example Response**:
```json
{
  "success": true,
  "message": "FTP account 'admin@example.com' deleted successfully",
  "commandId": "xyz789-abc123-def456"
}
```

**Error Responses**:
- `400`: Invalid username format (must be `localUsername@domain`)
- `404`: FTP account not found
- `500`: Failed to delete account

---

#### `POST /domains/ftp/accounts/:username/test`

**Description**: Tests FTP account credentials by attempting a connection. Username must be in `localUsername@domain` format.

**Path Parameters**:
- `username` (string): FTP username in format `localUsername@domain` (e.g., `admin@example.com`)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Domain name (for validation - must match username domain)

**Request Body**:
```typescript
{
  password: string;  // Password to test
}
```

**Response**:
```typescript
{
  success: boolean;
  message: string;
  connectionTime?: number;  // Connection time in milliseconds
}
```

**Example Response**:
```json
{
  "success": true,
  "message": "FTP credentials are valid",
  "connectionTime": 125
}
```

**Error Responses**:
- `400`: Invalid username format (must be `localUsername@domain`)
- `401`: Invalid credentials
- `404`: FTP account not found
- `500`: Failed to test connection

---

#### `GET /domains/ftp/server/status`

**Description**: Checks FTP server installation and running status.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  serverType: 'vsftpd' | 'proftpd' | 'pure-ftpd' | 'none';
  installed: boolean;
  running: boolean;
  version?: string;
  port?: number;  // FTP port (default: 21)
  passivePorts?: {  // Passive mode port range
    min: number;
    max: number;
  };
  configPath?: string;  // Main configuration file path
}
```

**Example Response**:
```json
{
  "serverType": "vsftpd",
  "installed": true,
  "running": true,
  "version": "3.0.3",
  "port": 21,
  "passivePorts": {
    "min": 50000,
    "max": 51000
  },
  "configPath": "/etc/vsftpd.conf"
}
```

---

#### `POST /domains/ftp/server/install`

**Description**: Installs an FTP server (vsftpd, proftpd, or pure-ftpd) on the instance.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Request Body**:
```typescript
{
  type: 'vsftpd' | 'proftpd' | 'pure-ftpd';
  port?: number;  // FTP port (default: 21)
  passivePorts?: {  // Passive mode port range
    min: number;
    max: number;
  };
  configureFirewall?: boolean;  // Configure firewall rules (default: true)
  enableTLS?: boolean;  // Enable FTPS (FTP over TLS) (default: false)
}
```

**Example Request**:
```json
{
  "type": "vsftpd",
  "port": 21,
  "passivePorts": {
    "min": 50000,
    "max": 51000
  },
  "configureFirewall": true,
  "enableTLS": false
}
```

**Response**:
```typescript
{
  commandId: string;
  status: string;  // "InProgress"
}
```

**Error Responses**:
- `400`: Invalid FTP server type or configuration
- `409`: FTP server already installed
- `500`: Failed to start installation

---

#### `POST /domains/ftp/server/uninstall`

**Description**: Uninstalls the FTP server from the instance.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Request Body**:
```typescript
{
  type: 'vsftpd' | 'proftpd' | 'pure-ftpd';
  removeConfig?: boolean;  // Remove configuration files (default: false)
}
```

**Response**:
```typescript
{
  commandId: string;
  status: string;  // "InProgress"
}
```

---

#### `GET /domains/ftp/server/installation/:commandId`

**Description**: Checks the status of an FTP server installation/uninstallation command.

**Path Parameters**:
- `commandId` (string): SSM command ID

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Response**:
```typescript
{
  status: string;  // "Success", "Failed", "Cancelled", "TimedOut", "InProgress", "Pending"
  output?: string;
  error?: string;
}
```

---

## FTP Account Management Details

### Supported FTP Servers

1. **vsftpd (Very Secure FTP Daemon)**
   - Most common on Ubuntu/Debian
   - Configuration: `/etc/vsftpd.conf`
   - User management: System users with `/etc/passwd`
   - Chroot: `chroot_local_user=YES`

2. **proftpd**
   - Common on various distributions
   - Configuration: `/etc/proftpd/proftpd.conf`
   - User management: System users or SQL authentication
   - Chroot: `DefaultRoot` directive

3. **pure-ftpd**
   - Lightweight alternative
   - Configuration: `/etc/pure-ftpd/pure-ftpd.conf`
   - User management: System users or virtual users
   - Chroot: Built-in chroot support

### FTP Account Creation Process

**Username Format**: All FTP accounts use `localUsername@domain` format (e.g., `admin@example.com`). The system username (for `/etc/passwd`) is sanitized to replace `@` with `_` or similar (e.g., `admin_example_com`).

1. **Parse Username**:
   - Full username: `admin@example.com`
   - Local username: `admin`
   - Domain: `example.com`
   - System username: `admin_example_com` (sanitized for `/etc/passwd`)

2. **Create System User**:
   ```bash
   useradd -d /var/www/example.com -s /usr/sbin/nologin -g www-data admin_example_com
   ```

3. **Set Password**:
   ```bash
   echo "admin_example_com:SecurePassword123!" | chpasswd
   ```

4. **Set Permissions**:
   ```bash
   chown -R admin_example_com:www-data /var/www/example.com
   chmod 755 /var/www/example.com
   ```

5. **Configure FTP Server** (vsftpd example):
   - Add system username to `/etc/vsftpd.user_list` if using user list
   - Configure bandwidth limits in `/etc/vsftpd.conf` or user config
   - Map display username (`admin@example.com`) to system username (`admin_example_com`) in FTP server config
   - Restart FTP server

**Note**: The FTP server may need custom configuration to support `@domain` usernames, or the system may use the sanitized system username for authentication while displaying the full `@domain` format in the UI.

### FTP Account Home Directory

- **Strictly scoped to domain**: All FTP accounts are limited to their domain's document root
- Typically matches domain document root: `/var/www/{domain}`
- Must be owned by FTP user and web server group (www-data/apache)
- Permissions: `755` for directories, `644` for files
- Chroot enabled to prevent access outside home directory
- Cannot access files outside the domain's document root
- Home directory must be within or equal to the domain's document root path

### Security Considerations

1. **Domain Scoping**: All FTP accounts are strictly limited to their domain's document root - no cross-domain access
2. **Username Namespacing**: Usernames are namespaced with `@domain` to prevent collisions (e.g., `admin@example.com` vs `admin@otherdomain.com`)
3. **Password Requirements**: Minimum 8 characters, recommend strong passwords
4. **Chroot**: All FTP accounts should be chrooted to their home directory (domain document root)
5. **Shell**: Use `/usr/sbin/nologin` or `/sbin/nologin` to prevent shell access
6. **Firewall**: Only allow FTP ports (21, and passive port range) from trusted IPs
7. **FTPS**: Enable TLS/SSL for encrypted connections (recommended)
8. **Rate Limiting**: Configure bandwidth and connection limits per user
9. **System Username Sanitization**: System usernames (in `/etc/passwd`) are sanitized (e.g., `admin_example_com`) while display usernames use `@domain` format

### FTP Server Configuration Files

**vsftpd** (`/etc/vsftpd.conf`):
```ini
listen=YES
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022
chroot_local_user=YES
allow_writeable_chroot=YES
userlist_enable=YES
userlist_file=/etc/vsftpd.user_list
pasv_enable=YES
pasv_min_port=50000
pasv_max_port=51000
```

**proftpd** (`/etc/proftpd/proftpd.conf`):
```apache
DefaultRoot ~
RequireValidShell off
```

**pure-ftpd** (`/etc/pure-ftpd/pure-ftpd.conf`):
```
ChrootEveryone yes
```

---

## Frontend Component Structure

### Main Component: `DomainsPage`

**Location**: `apps/web/app/(dashboard)/dashboard/domains/page.tsx`

**Key State Variables**:
- `serverInfo`: Server information and domain list
- `selectedDomain`: Currently selected domain
- `activeTab`: Active tab ('info', 'ssl', 'email', 'ftp')
- `dnsRecords`: DNS records for selected domain
- `sslCertificates`: SSL certificates list
- `emailIdentities`: SES email identities
- `quotaUsed`: Disk usage in bytes
- `ssmAgentStatus`: SSM agent status
- `isInitializing`: SSM agent initialization state
- `managedDomains`: Domains from database

**Key Functions**:
- `loadServerInfo()`: Fetches server information
- `loadManagedDomains()`: Loads domains from database
- `loadDnsRecords()`: Loads DNS records for selected domain
- `loadSslCertificates()`: Loads SSL certificates
- `loadEmailIdentities()`: Loads SES email identities
- `loadDomainQuota()`: Loads disk usage for domain
- `loadFtpAccounts()`: Loads FTP accounts for domain (to be implemented)
- `createDomain()`: Creates a new domain
- `deleteDomain()`: Deletes a domain
- `createFtpAccount()`: Creates a new FTP account (to be implemented)
- `updateFtpAccount()`: Updates FTP account settings (to be implemented)
- `deleteFtpAccount()`: Deletes FTP account (to be implemented)
- `initializeSSMAgent()`: Initializes SSM agent (checks status, installs/starts if needed)
- `installWebServer()`: Installs web server
- `uninstallWebServer()`: Uninstalls web server
- `installFtpServer()`: Installs FTP server (to be implemented)
- `uninstallFtpServer()`: Uninstalls FTP server (to be implemented)

**Polling Mechanisms**:
- SSM agent installation/start: Polls every 3-5 seconds
- Web server installation/uninstallation: Polls every 3 seconds

---

## Data Flow

### Initial Load Sequence

1. **Check Instance ID**: Reads from `localStorage`
2. **Initialize SSM Agent**:
   - Check agent status
   - If not installed/running, attempt installation/start
   - Poll until agent is ready
3. **Load Server Info**: Fetch web server and domain information
4. **Load Managed Domains**: Fetch domains from database
5. **Select First Domain**: Auto-select first domain if available
6. **Load Domain-Specific Data**: DNS records, SSL certificates, quota (when domain selected)

### Domain Selection Flow

When a domain is selected:
1. Update `selectedDomain` state
2. Load DNS records (`loadDnsRecords()`)
3. Load SSL certificates (`loadSslCertificates()`)
4. If on 'info' tab, load quota (`loadDomainQuota()`)
5. If on 'email' tab, load email identities (`loadEmailIdentities()`)
6. If on 'ftp' tab, load FTP accounts (`loadFtpAccounts()`)

### Domain Creation Flow

1. User fills form in `AddDomainModal`
2. `createDomain()` called with domain details
3. Backend:
   - Creates Route53 hosted zone
   - Creates A records
   - Creates web server config via SSM
   - Saves to database
4. Frontend:
   - Reloads managed domains
   - Reloads server info
   - Selects newly created domain

### Domain Deletion Flow

1. User confirms deletion in `DeleteConfirmationModal`
2. `deleteDomain()` called
3. Backend:
   - Deletes web server config via SSM
   - Deletes DNS records
   - Deletes Route53 hosted zone
   - Removes from database
4. Frontend:
   - Reloads managed domains
   - Reloads server info
   - Clears selected domain if deleted

---

## Dependencies

### AWS Services
- **SSM (Systems Manager)**: Execute commands on EC2 instances
- **Route53**: DNS management
- **EC2**: Instance information and metadata
- **SES (Simple Email Service)**: Email identity management

### Backend Dependencies
- AWS SDK v3 (`@aws-sdk/client-ssm`, `@aws-sdk/client-route-53`, `@aws-sdk/client-ec2`)
- MongoDB: Domain metadata storage
- Express.js: API routes

### Frontend Dependencies
- React: UI framework
- Next.js: Framework and routing
- Lucide React: Icons

### System Requirements
- SSM agent installed and running on EC2 instance
- IAM role with `AmazonSSMManagedInstanceCore` policy attached to instance
- AWS credentials configured in server settings
- Certbot installed (for SSL certificate management)
- Nginx or Apache installed (for web server management)
- FTP server (vsftpd, proftpd, or pure-ftpd) for FTP account management (optional)

---

## Error Handling

### Common Error Scenarios

1. **No Instance Selected**:
   - Shows message: "No EC2 instance selected. Please select an instance from the dropdown above."
   - Blocks page functionality

2. **SSM Agent Not Installed**:
   - Shows initialization screen
   - Attempts installation via SSM (may fail if agent completely missing)
   - Provides helpful error message with installation instructions

3. **No Web Server Installed**:
   - Shows web server installation panel
   - User can install Nginx or Apache

4. **AWS Credentials Not Configured**:
   - API returns 400/500 error
   - Frontend displays error message

5. **Domain Not Found in Route53**:
   - DNS endpoint falls back to public DNS lookup
   - Shows records from external DNS API

---

## Performance Considerations

1. **Caching**: Server info and SSM agent status are cached in database to reduce SSM API calls
2. **Background Refresh**: Fresh data is fetched in background after returning cached data
3. **Polling Intervals**: 
   - SSM commands: 3-5 seconds
   - Web server operations: 3 seconds
4. **Lazy Loading**: Domain-specific data (DNS, SSL, quota) only loaded when domain is selected

---

## Security Considerations

1. **Instance ID Validation**: Must start with `i-` prefix
2. **AWS Credentials**: Stored securely in server settings (not exposed to frontend)
3. **SSM Commands**: All commands executed with instance's IAM role permissions
4. **Route53 Access**: Requires Route53 permissions in AWS credentials
5. **SSL Certificates**: Managed via Certbot with Let's Encrypt

---

## Future Improvements

1. **FTP Account Management**: API endpoints designed (see section 9), UI implementation needed
2. **Domain Edit Functionality**: Currently shows alert, needs implementation
3. **DNS Record Management UI**: Add/edit/delete DNS records from UI
4. **SSL Certificate Auto-Renewal**: Automated renewal scheduling
5. **Multiple Instance Support**: Better handling of multiple EC2 instances
6. **Domain Import**: Import existing domains from server config
7. **Backup/Restore**: Domain configuration backup functionality
8. **FTPS Support**: Enable TLS/SSL for FTP connections
9. **FTP Logs**: View FTP access and error logs
10. **FTP Quota**: Disk quota management per FTP account

---

## Testing Considerations

1. **Mock SSM Responses**: Test SSM command polling
2. **Route53 API Mocking**: Test DNS operations
3. **Error Scenarios**: Test all error conditions
4. **Instance Selection**: Test localStorage and event handling
5. **Polling Logic**: Test command status polling
6. **Cache Behavior**: Test cached vs fresh data scenarios

---

## Related Documentation

- AWS SSM Documentation: https://docs.aws.amazon.com/systems-manager/
- Route53 API Reference: https://docs.aws.amazon.com/Route53/latest/APIReference/
- Certbot Documentation: https://certbot.eff.org/docs/
- Nginx Configuration: https://nginx.org/en/docs/
- Apache Configuration: https://httpd.apache.org/docs/

