# FTP Account Management & SSM Implementation Guide

## Overview

This document provides a detailed specification for implementing FTP account management on the domains page using AWS Systems Manager (SSM). It focuses exclusively on FTP functionality and SSM command execution patterns, excluding other domain management features (DNS, SSL, email, etc.).

## Architecture

The FTP implementation uses AWS SSM to execute commands on EC2 instances to:
- Install and manage vsftpd (Very Secure FTP Daemon) FTP server
- Create, update, and delete FTP user accounts
- Configure FTP server settings
- Test FTP connections

**Key Principle**: All FTP accounts are strictly scoped to a domain, and usernames are namespaced with `@domain` format (e.g., `admin@example.com`) to prevent collisions.

**FTP Server**: This implementation uses **vsftpd only**. vsftpd is the most common and secure FTP server for Linux distributions (Ubuntu, Debian, CentOS, RHEL).

## SSM Agent Requirements

Before any FTP operations can be performed, the SSM agent must be installed and running on the target EC2 instance.

### Prerequisites

1. **SSM Agent Installed**: The agent must be installed on the EC2 instance
2. **SSM Agent Running**: The agent must be in "Online" status
3. **IAM Role**: Instance must have an IAM role with `AmazonSSMManagedInstanceCore` policy
4. **Instance State**: Instance must be in "running" state

### SSM Agent Status Check

**Endpoint**: `GET /domains/ssm-agent/status`

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

**SSM Implementation**: Uses `DescribeInstanceInformationCommand` to check if instance is registered with SSM and if `PingStatus === 'Online'`.

---

## FTP Server Management

### 1. Check FTP Server Status

**Endpoint**: `GET /domains/ftp/server/status`

**Description**: Detects which FTP server (if any) is installed and checks if it's running.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**SSM Commands Executed**:
```bash
#!/bin/bash
# Check if vsftpd is installed
if command -v vsftpd &> /dev/null; then
  echo "INSTALLED:true"
  echo "VERSION:$(vsftpd -v 2>&1 | head -1)"
  echo "CONFIG_PATH:/etc/vsftpd.conf"
  
  # Check if service is running
  if systemctl is-active --quiet vsftpd 2>/dev/null; then
    echo "RUNNING:true"
  else
    echo "RUNNING:false"
  fi
  
  # Get port from config (default: 21)
  port=$(grep -E "^listen_port|^port" /etc/vsftpd.conf 2>/dev/null | grep -oE "[0-9]+" | head -1 || echo "21")
  echo "PORT:${port}"
  
  # Get passive port range from config
  pasv_min=$(grep "^pasv_min_port" /etc/vsftpd.conf 2>/dev/null | grep -oE "[0-9]+" | head -1 || echo "50000")
  pasv_max=$(grep "^pasv_max_port" /etc/vsftpd.conf 2>/dev/null | grep -oE "[0-9]+" | head -1 || echo "51000")
  echo "PASV_MIN:${pasv_min}"
  echo "PASV_MAX:${pasv_max}"
else
  echo "INSTALLED:false"
  echo "RUNNING:false"
  echo "SERVER_TYPE:none"
fi
```

**Response**:
```typescript
{
  serverType: 'vsftpd' | 'none';
  installed: boolean;
  running: boolean;
  version?: string;
  port?: number;  // Default: 21
  passivePorts?: {
    min: number;
    max: number;
  };
  configPath?: string;  // Default: /etc/vsftpd.conf
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

**Error Responses**:
- `400`: AWS credentials not configured or EC2 instance ID not found
- `500`: Failed to check FTP server status

---

### 2. Install FTP Server

**Endpoint**: `POST /domains/ftp/server/install`

**Description**: Installs vsftpd FTP server on the instance using SSM.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Request Body**:
```typescript
{
  port?: number;  // FTP port (default: 21)
  passivePorts?: {
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
  "port": 21,
  "passivePorts": {
    "min": 50000,
    "max": 51000
  },
  "configureFirewall": true,
  "enableTLS": true
}
```

**SSM Command Execution**:

The endpoint sends an SSM `SendCommandCommand` with the following shell script:
```bash
#!/bin/bash
set -e

echo "Installing vsftpd FTP server..."

# Update package list
apt update -y 2>/dev/null || yum update -y 2>/dev/null || true

# Install vsftpd
apt install -y vsftpd 2>/dev/null || yum install -y vsftpd 2>/dev/null

# Backup original config
cp /etc/vsftpd.conf /etc/vsftpd.conf.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Generate configuration
cat > /etc/vsftpd.conf << 'VSFTPD_EOF'
# Security Settings
anonymous_enable=NO
local_enable=YES
write_enable=YES
chroot_local_user=YES
allow_writeable_chroot=YES
hide_ids=YES

# Network Settings
listen=YES
listen_ipv6=NO
listen_address=0.0.0.0
port=21

# Passive Mode
pasv_enable=YES
pasv_min_port=50000
pasv_max_port=51000
pasv_address=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")

# Performance
idle_session_timeout=600
data_connection_timeout=120
max_clients=50
max_per_ip=5

# FTPS Encryption (if enabled)
ssl_enable=YES
allow_anon_ssl=NO
force_local_data_ssl=YES
force_local_logins_ssl=YES
ssl_tlsv1=YES
ssl_sslv2=NO
ssl_sslv3=NO
rsa_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem
rsa_private_key_file=/etc/ssl/private/ssl-cert-snakeoil.key

# Logging
xferlog_enable=YES
xferlog_file=/var/log/vsftpd.log
dual_log_enable=YES
vsftpd_log_file=/var/log/vsftpd.log
VSFTPD_EOF

# Create SSL certificate for FTPS (if enabled and not exists)
if [ ! -f /etc/ssl/certs/ssl-cert-snakeoil.pem ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/ssl-cert-snakeoil.key \
    -out /etc/ssl/certs/ssl-cert-snakeoil.pem \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>/dev/null || true
fi

# Configure firewall (if requested)
if [ "$configureFirewall" = "true" ]; then
  ufw allow 21/tcp 2>/dev/null || firewall-cmd --add-port=21/tcp --permanent 2>/dev/null || true
  ufw allow 50000:51000/tcp 2>/dev/null || firewall-cmd --add-port=50000-51000/tcp --permanent 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || ufw reload 2>/dev/null || true
fi

# Enable and start service
systemctl enable vsftpd
systemctl restart vsftpd || systemctl start vsftpd

# Verify installation
if systemctl is-active --quiet vsftpd; then
  echo "vsftpd installed and running successfully"
  vsftpd -v 2>&1 | head -1
else
  echo "ERROR: vsftpd installation failed"
  systemctl status vsftpd
  exit 1
fi
```


**SSM Command Details**:
- **Document**: `AWS-RunShellScript`
- **Timeout**: 600 seconds (10 minutes)
- **Comment**: `Install vsftpd FTP server`

**Response**:
```typescript
{
  commandId: string;
  status: string;  // "InProgress"
}
```

**Example Response**:
```json
{
  "commandId": "abc123-def456-ghi789",
  "status": "InProgress"
}
```

**Error Responses**:
- `400`: AWS credentials not configured or EC2 instance ID not found
- `409`: vsftpd already installed
- `500`: Failed to send SSM command or installation failed

---

### 3. Check Installation Status

**Endpoint**: `GET /domains/ftp/server/installation/:commandId`

**Description**: Polls SSM to check the status of an FTP server installation command.

**Path Parameters**:
- `commandId` (string): SSM command ID returned from install endpoint

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**SSM Implementation**: Uses `GetCommandInvocationCommand` to check command status.

**Response**:
```typescript
{
  status: string;  // "Success", "Failed", "Cancelled", "TimedOut", "InProgress", "Pending"
  output?: string;  // Command output (stdout)
  error?: string;  // Error message (stderr)
}
```

**Example Response (Success)**:
```json
{
  "status": "Success",
  "output": "vsftpd installed and running successfully\nvsftpd version 3.0.3"
}
```

**Example Response (In Progress)**:
```json
{
  "status": "InProgress",
  "output": "Installing vsftpd FTP server...\nReading package lists..."
}
```

**Example Response (Failed)**:
```json
{
  "status": "Failed",
  "output": "Installing vsftpd FTP server...",
  "error": "E: Unable to locate package vsftpd"
}
```

**Polling Strategy**: Frontend should poll this endpoint every 3 seconds until status is `Success`, `Failed`, `Cancelled`, or `TimedOut`.

---

### 4. Uninstall FTP Server

**Endpoint**: `POST /domains/ftp/server/uninstall`

**Description**: Uninstalls the FTP server from the instance.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID

**Request Body**:
```typescript
{
  removeConfig?: boolean;  // Remove configuration files (default: false)
}
```

**Example Request**:
```json
{
  "removeConfig": false
}
```

**SSM Commands Executed**:

```bash
#!/bin/bash
set -e

echo "Uninstalling vsftpd FTP server..."

# Stop and disable service
systemctl stop vsftpd || true
systemctl disable vsftpd || true

# Remove package
apt remove -y vsftpd 2>/dev/null || yum remove -y vsftpd 2>/dev/null || true
apt purge -y vsftpd 2>/dev/null || true

# Remove configuration (if requested)
if [ "$removeConfig" = "true" ]; then
  rm -rf /etc/vsftpd.conf* /etc/vsftpd/ 2>/dev/null || true
  rm -rf /var/log/vsftpd* 2>/dev/null || true
fi

# Remove firewall rules
ufw delete allow 21/tcp 2>/dev/null || firewall-cmd --remove-port=21/tcp --permanent 2>/dev/null || true
ufw delete allow 50000:51000/tcp 2>/dev/null || firewall-cmd --remove-port=50000-51000/tcp --permanent 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || ufw reload 2>/dev/null || true

echo "vsftpd uninstalled successfully"
```

**SSM Command Details**:
- **Document**: `AWS-RunShellScript`
- **Timeout**: 300 seconds (5 minutes)
- **Comment**: `Uninstall vsftpd FTP server`

**Response**:
```typescript
{
  commandId: string;
  status: string;  // "InProgress"
}
```

---

## FTP Account Management

### Username Format and Domain Scoping

**Critical Requirements**:
1. All FTP accounts are strictly scoped to a domain
2. Usernames use `localUsername@domain` format (e.g., `admin@example.com`)
3. System usernames (in `/etc/passwd`) are sanitized (e.g., `admin_example_com`)
4. Home directory must be within the domain's document root

**Username Sanitization**:
- Display username: `admin@example.com`
- System username: `admin_example_com` (replaces `@` and `.` with `_`)
- Maximum system username length: 32 characters (Linux limit)

---

### 1. List FTP Accounts

**Endpoint**: `GET /domains/ftp/accounts`

**Description**: Lists all FTP accounts for a specific domain. Domain is required.

**Query Parameters**:
- `domain` (required, string): Domain name to list accounts for
- `instanceId` (optional, string): EC2 instance ID

**SSM Commands Executed**:

```bash
#!/bin/bash
# List all system users that match the domain pattern
# System usernames are sanitized (e.g., admin_example_com)
domain_sanitized=$(echo "$domain" | tr '.' '_' | tr '@' '_')

# Get all users from /etc/passwd that match pattern
grep -E "^[^:]+_${domain_sanitized}:" /etc/passwd | while IFS=: read -r username _ uid gid _ home shell; do
  # Extract local username and domain from system username
  # System: admin_example_com -> Display: admin@example.com
  local_username=$(echo "$username" | sed "s/_${domain_sanitized}$//")
  
  # Get account status
  account_status=$(passwd -S "$username" 2>/dev/null | awk '{print $2}' || echo "P")
  enabled="true"
  if [ "$account_status" = "L" ]; then
    enabled="false"
  fi
  
  # Get creation date (from home directory modification time)
  created_date=$(stat -c %y "$home" 2>/dev/null | cut -d' ' -f1 || echo "")
  
  # Get last login (from vsftpd logs or lastlog)
  last_login=$(lastlog -u "$username" 2>/dev/null | tail -1 | awk '{print $4" "$5" "$6" "$7}' || echo "")
  
  echo "USERNAME:${local_username}@${domain}"
  echo "LOCAL_USERNAME:${local_username}"
  echo "DOMAIN:${domain}"
  echo "HOME:${home}"
  echo "ENABLED:${enabled}"
  echo "UID:${uid}"
  echo "GID:${gid}"
  if [ -n "$created_date" ]; then
    echo "CREATED_AT:${created_date}"
  fi
  if [ -n "$last_login" ] && [ "$last_login" != "**Never" ]; then
    echo "LAST_LOGIN:${last_login}"
  fi
  echo "SERVER_TYPE:vsftpd"
  echo "---"
done
```

**Response**:
```typescript
{
  accounts: Array<{
    username: string;  // Full username with @domain (e.g., "admin@example.com")
    localUsername: string;  // Local username part (e.g., "admin")
    domain: string;  // Domain name (required)
    homeDirectory: string;  // Absolute path to FTP home directory
    enabled: boolean;  // Whether account is active
    createdAt?: string;  // ISO date string (from user creation date)
    lastLogin?: string;  // ISO date string (from FTP logs)
    serverType?: 'vsftpd';
    uid?: number;
    gid?: number;
  }>;
  domain: string;  // The domain these accounts belong to
  serverType?: 'vsftpd' | 'none';
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
      "serverType": "vsftpd",
      "uid": 1001,
      "gid": 33
    },
    {
      "username": "user@example.com",
      "localUsername": "user",
      "domain": "example.com",
      "homeDirectory": "/var/www/example.com/subdir",
      "enabled": true,
      "createdAt": "2025-01-18T08:15:00Z",
      "serverType": "vsftpd",
      "uid": 1002,
      "gid": 33
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

### 2. Create FTP Account

**Endpoint**: `POST /domains/ftp/accounts`

**Description**: Creates a new FTP account for a specific domain. The username is automatically namespaced with `@domain`.

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID (required in practice)

**Request Body**:
```typescript
{
  localUsername: string;  // Local username part (without @domain) - 3-32 chars, alphanumeric, underscores, hyphens only
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

**SSM Commands Executed**:

```bash
#!/bin/bash
set -e

# Parse inputs
local_username="$localUsername"
password="$password"
domain="$domain"
home_dir="${homeDirectory:-/var/www/$domain}"
gid="${gid:-33}"  # www-data group ID (33 on Debian/Ubuntu)

# Sanitize username for system (replace @ and . with _)
system_username="${local_username}_$(echo "$domain" | tr '.' '_' | tr '@' '_')"

# Validate system username length (max 32 chars)
if [ ${#system_username} -gt 32 ]; then
  echo "ERROR: System username too long (max 32 characters)"
  exit 1
fi

# Check if user already exists
if id "$system_username" &>/dev/null; then
  echo "ERROR: User $system_username already exists"
  exit 1
fi

# Get web server group (www-data or apache)
web_group=$(getent group www-data | cut -d: -f1 || getent group apache | cut -d: -f1 || echo "www-data")
web_gid=$(getent group "$web_group" | cut -d: -f3 || echo "33")

# Create home directory if it doesn't exist
mkdir -p "$home_dir"
chmod 755 "$home_dir"

# Create system user
useradd -d "$home_dir" \
        -s /usr/sbin/nologin \
        -g "$web_group" \
        -m \
        "$system_username"

# Set password
echo "${system_username}:${password}" | chpasswd

# Set ownership and permissions
chown -R "${system_username}:${web_group}" "$home_dir"
chmod 755 "$home_dir"

# Create default index.html if doesn't exist
if [ ! -f "$home_dir/index.html" ]; then
  cat > "$home_dir/index.html" << EOF
<!DOCTYPE html>
<html>
<head><title>Welcome to $domain</title></head>
<body><h1>Welcome to $domain</h1><p>FTP account: ${local_username}@${domain}</p></body>
</html>
EOF
  chown "${system_username}:${web_group}" "$home_dir/index.html"
  chmod 644 "$home_dir/index.html"
fi

# Configure vsftpd-specific settings
if [ -f /etc/vsftpd.conf ]; then
  # Add user to allowed list (if using user list)
  if grep -q "^userlist_enable=YES" /etc/vsftpd.conf; then
    echo "$system_username" >> /etc/vsftpd/user_list 2>/dev/null || true
  fi
  
  # Configure bandwidth limits (if provided)
  if [ -n "$uploadBandwidth" ] || [ -n "$downloadBandwidth" ]; then
    user_config="/etc/vsftpd/users/${system_username}"
    mkdir -p /etc/vsftpd/users
    cat > "$user_config" << EOF
local_root=$home_dir
anon_upload_enable=NO
anon_mkdir_write_enable=NO
EOF
    [ -n "$uploadBandwidth" ] && echo "local_max_rate=$((uploadBandwidth * 1024))" >> "$user_config"
    [ -n "$downloadBandwidth" ] && echo "anon_max_rate=$((downloadBandwidth * 1024))" >> "$user_config"
    
    # Ensure user_config_dir is in main config
    if ! grep -q "^user_config_dir" /etc/vsftpd.conf; then
      echo "user_config_dir=/etc/vsftpd/users" >> /etc/vsftpd.conf
    fi
  fi
  
  # Reload vsftpd to apply changes
  systemctl reload vsftpd || systemctl restart vsftpd || true
fi

echo "SUCCESS: FTP account created: ${local_username}@${domain}"
echo "SYSTEM_USERNAME: $system_username"
echo "HOME_DIRECTORY: $home_dir"
```

**SSM Command Details**:
- **Document**: `AWS-RunShellScript`
- **Timeout**: 120 seconds (2 minutes)
- **Comment**: `Create FTP account ${localUsername}@${domain}`

**Response**:
```typescript
{
  account: {
    username: string;  // Full username with @domain (e.g., "admin@example.com")
    localUsername: string;  // Local username part (e.g., "admin")
    domain: string;  // Domain name
    homeDirectory: string;
    enabled: boolean;
    createdAt: string;  // ISO date string
    serverType: 'vsftpd';
  };
  commandId: string;  // SSM command ID
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
- `homeDirectory`: Must be absolute path, must be within domain's document root
- Full username format: `{localUsername}@{domain}` (e.g., `admin@example.com`)
- System username: Sanitized version (e.g., `admin_example_com`)

---

### 3. Get FTP Account Details

**Endpoint**: `GET /domains/ftp/accounts/:username`

**Description**: Retrieves details for a specific FTP account. Username must be in `localUsername@domain` format.

**Path Parameters**:
- `username` (string): FTP username in format `localUsername@domain` (e.g., `admin@example.com`)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Domain name (for validation - must match username domain)

**SSM Commands Executed**:

```bash
#!/bin/bash
# Parse username (e.g., admin@example.com)
IFS='@' read -r local_username domain_part <<< "$username"

if [ -z "$local_username" ] || [ -z "$domain_part" ]; then
  echo "ERROR: Invalid username format. Expected: localUsername@domain"
  exit 1
fi

# Sanitize for system username
system_username="${local_username}_$(echo "$domain_part" | tr '.' '_')"

# Get user info from /etc/passwd
if ! id "$system_username" &>/dev/null; then
  echo "ERROR: User not found"
  exit 1
fi

user_info=$(getent passwd "$system_username")
IFS=':' read -r _ _ uid gid _ home shell <<< "$user_info"

# Get group name
group_name=$(getent group "$gid" | cut -d: -f1)

# Check if account is enabled (not locked)
account_status=$(passwd -S "$system_username" 2>/dev/null | awk '{print $2}')
enabled="true"
if [ "$account_status" = "L" ]; then
  enabled="false"
fi

# Get creation date (from /etc/passwd modification or user home directory)
created_date=$(stat -c %y "$home" 2>/dev/null | cut -d' ' -f1 || echo "")

# Get last login (from FTP logs or lastlog)
last_login=$(lastlog -u "$system_username" 2>/dev/null | tail -1 | awk '{print $4" "$5" "$6" "$7}' || echo "")

# Get bandwidth limits (from vsftpd user config if exists)
upload_bandwidth=""
download_bandwidth=""
if [ -f "/etc/vsftpd/users/${system_username}" ]; then
  upload_bandwidth=$(grep "^local_max_rate" "/etc/vsftpd/users/${system_username}" | cut -d'=' -f2 | awk '{print int($1/1024)}' || echo "")
  download_bandwidth=$(grep "^anon_max_rate" "/etc/vsftpd/users/${system_username}" | cut -d'=' -f2 | awk '{print int($1/1024)}' || echo "")
fi

echo "USERNAME:${local_username}@${domain_part}"
echo "LOCAL_USERNAME:${local_username}"
echo "DOMAIN:${domain_part}"
echo "HOME_DIRECTORY:${home}"
echo "ENABLED:${enabled}"
echo "UID:${uid}"
echo "GID:${gid}"
echo "GROUP:${group_name}"
echo "SHELL:${shell}"
if [ -n "$created_date" ]; then
  echo "CREATED_AT:${created_date}"
fi
if [ -n "$last_login" ]; then
  echo "LAST_LOGIN:${last_login}"
fi
if [ -n "$upload_bandwidth" ]; then
  echo "UPLOAD_BANDWIDTH:${upload_bandwidth}"
fi
if [ -n "$download_bandwidth" ]; then
  echo "DOWNLOAD_BANDWIDTH:${download_bandwidth}"
fi
```

**Response**:
```typescript
{
  account: {
    username: string;  // Full username with @domain (e.g., "admin@example.com")
    localUsername: string;  // Local username part (e.g., "admin")
    domain: string;  // Domain name (required)
    homeDirectory: string;
    enabled: boolean;
    createdAt?: string;  // ISO date string
    lastLogin?: string;  // ISO date string
    serverType?: 'vsftpd';
    uploadBandwidth?: number;  // KB/s
    downloadBandwidth?: number;  // KB/s
    maxConnections?: number;
    uid?: number;
    gid?: number;
    group?: string;
    shell?: string;
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
    "gid": 33,
    "group": "www-data",
    "shell": "/usr/sbin/nologin"
  }
}
```

**Error Responses**:
- `400`: Invalid username format (must be `localUsername@domain`)
- `404`: FTP account not found
- `500`: Failed to retrieve account details

---

### 4. Update FTP Account

**Endpoint**: `PUT /domains/ftp/accounts/:username`

**Description**: Updates an existing FTP account. Can update password, home directory, bandwidth limits, and other settings.

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
  "maxConnections": 10,
  "enabled": true
}
```

**SSM Commands Executed**:

```bash
#!/bin/bash
set -e

# Parse username
IFS='@' read -r local_username domain_part <<< "$username"
system_username="${local_username}_$(echo "$domain_part" | tr '.' '_')"

# Verify user exists
if ! id "$system_username" &>/dev/null; then
  echo "ERROR: User $system_username not found"
  exit 1
fi

# Update password if provided
if [ -n "$password" ]; then
  echo "${system_username}:${password}" | chpasswd
  echo "Password updated"
fi

# Update home directory if provided
if [ -n "$homeDirectory" ]; then
  # Validate home directory is within domain document root
  domain_root="/var/www/${domain_part}"
  if [[ ! "$homeDirectory" == "$domain_root"* ]]; then
    echo "ERROR: Home directory must be within domain document root: $domain_root"
    exit 1
  fi
  
  # Create new home directory if doesn't exist
  mkdir -p "$homeDirectory"
  chmod 755 "$homeDirectory"
  
  # Move files if old home exists
  old_home=$(getent passwd "$system_username" | cut -d: -f6)
  if [ -d "$old_home" ] && [ "$old_home" != "$homeDirectory" ]; then
    cp -a "$old_home"/* "$homeDirectory"/ 2>/dev/null || true
  fi
  
  # Update home directory
  usermod -d "$homeDirectory" "$system_username"
  
  # Set ownership
  chown -R "${system_username}:$(id -gn $system_username)" "$homeDirectory"
  echo "Home directory updated to: $homeDirectory"
fi

# Enable/disable account
if [ -n "$enabled" ]; then
  if [ "$enabled" = "true" ]; then
    usermod -U "$system_username"  # Unlock account
    echo "Account enabled"
  else
    usermod -L "$system_username"  # Lock account
    echo "Account disabled"
  fi
fi

# Update bandwidth limits
if [ -f /etc/vsftpd.conf ]; then
  user_config="/etc/vsftpd/users/${system_username}"
  mkdir -p /etc/vsftpd/users
  
  if [ -n "$uploadBandwidth" ] || [ -n "$downloadBandwidth" ]; then
    cat > "$user_config" << EOF
local_root=$(getent passwd "$system_username" | cut -d: -f6)
anon_upload_enable=NO
anon_mkdir_write_enable=NO
EOF
    [ -n "$uploadBandwidth" ] && echo "local_max_rate=$((uploadBandwidth * 1024))" >> "$user_config"
    [ -n "$downloadBandwidth" ] && echo "anon_max_rate=$((downloadBandwidth * 1024))" >> "$user_config"
    
    # Ensure user_config_dir is in main config
    if ! grep -q "^user_config_dir" /etc/vsftpd.conf; then
      echo "user_config_dir=/etc/vsftpd/users" >> /etc/vsftpd.conf
    fi
    
    systemctl reload vsftpd || systemctl restart vsftpd || true
    echo "Bandwidth limits updated"
  fi
fi

echo "SUCCESS: FTP account updated: ${local_username}@${domain_part}"
```

**SSM Command Details**:
- **Document**: `AWS-RunShellScript`
- **Timeout**: 120 seconds (2 minutes)
- **Comment**: `Update FTP account ${username}`

**Response**:
```typescript
{
  account: {
    username: string;  // Full username with @domain
    localUsername: string;
    domain: string;
    homeDirectory: string;
    enabled: boolean;
    updatedAt: string;  // ISO date string
    serverType: 'vsftpd';
  };
  commandId: string;  // SSM command ID
}
```

**Error Responses**:
- `400`: Invalid username format or invalid parameters
- `404`: FTP account not found
- `500`: Failed to update account

---

### 5. Delete FTP Account

**Endpoint**: `DELETE /domains/ftp/accounts/:username`

**Description**: Deletes an FTP account. Removes the system user and optionally removes the home directory.

**Path Parameters**:
- `username` (string): FTP username in format `localUsername@domain` (e.g., `admin@example.com`)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Domain name (for validation)
- `removeHomeDirectory` (optional, boolean): Whether to delete home directory (default: false)

**SSM Commands Executed**:

```bash
#!/bin/bash
set -e

# Parse username
IFS='@' read -r local_username domain_part <<< "$username"
system_username="${local_username}_$(echo "$domain_part" | tr '.' '_')"

# Verify user exists
if ! id "$system_username" &>/dev/null; then
  echo "ERROR: User $system_username not found"
  exit 1
fi

# Get home directory before deletion
home_directory=$(getent passwd "$system_username" | cut -d: -f6)

# Remove user-specific FTP config (vsftpd)
if [ -f "/etc/vsftpd/users/${system_username}" ]; then
  rm -f "/etc/vsftpd/users/${system_username}"
  systemctl reload vsftpd || true
fi

# Remove from user list (vsftpd)
if [ -f /etc/vsftpd/user_list ]; then
  sed -i "/^${system_username}$/d" /etc/vsftpd/user_list
fi

# Delete system user
userdel -r "$system_username" 2>/dev/null || userdel "$system_username"

# Remove home directory if requested
if [ "$removeHomeDirectory" = "true" ] && [ -d "$home_directory" ]; then
  rm -rf "$home_directory"
  echo "Home directory removed: $home_directory"
fi

echo "SUCCESS: FTP account deleted: ${local_username}@${domain_part}"
```

**SSM Command Details**:
- **Document**: `AWS-RunShellScript`
- **Timeout**: 60 seconds (1 minute)
- **Comment**: `Delete FTP account ${username}`

**Response**:
```typescript
{
  success: true;
  message: string;
  commandId: string;  // SSM command ID
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
- `400`: Invalid username format
- `404`: FTP account not found
- `500`: Failed to delete account

---

### 6. Test FTP Account

**Endpoint**: `POST /domains/ftp/accounts/:username/test`

**Description**: Tests FTP account credentials by attempting a connection.

**Path Parameters**:
- `username` (string): FTP username in format `localUsername@domain` (e.g., `admin@example.com`)

**Query Parameters**:
- `instanceId` (optional, string): EC2 instance ID
- `domain` (optional, string): Domain name (for validation)

**Request Body**:
```typescript
{
  password: string;  // Password to test
}
```

**SSM Commands Executed**:

```bash
#!/bin/bash
set -e

# Parse username
IFS='@' read -r local_username domain_part <<< "$username"
system_username="${local_username}_$(echo "$domain_part" | tr '.' '_')"

# Verify user exists
if ! id "$system_username" &>/dev/null; then
  echo "ERROR: User not found"
  exit 1
fi

# Get instance public IP
public_ip=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")

if [ -z "$public_ip" ]; then
  echo "ERROR: Could not determine public IP"
  exit 1
fi

# Test password using su or expect
# Note: This is a simplified test - in production, use proper FTP client
start_time=$(date +%s%N)

# Test password by attempting to change to user and verify
if echo "$password" | su - "$system_username" -c "echo 'Password test successful'" 2>/dev/null; then
  end_time=$(date +%s%N)
  connection_time=$(( (end_time - start_time) / 1000000 ))  # Convert to milliseconds
  
  echo "SUCCESS: Credentials are valid"
  echo "CONNECTION_TIME:${connection_time}"
  echo "PUBLIC_IP:${public_ip}"
  echo "FTP_PORT:21"
else
  echo "ERROR: Invalid credentials"
  exit 1
fi
```

**Alternative**: Use `ftp` or `curl` command to test actual FTP connection:

```bash
# Using curl to test FTP connection
timeout 10 curl -s --ftp-ssl --user "${system_username}:${password}" \
  "ftp://${public_ip}/" -o /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "SUCCESS: FTP connection successful"
else
  echo "ERROR: FTP connection failed"
  exit 1
fi
```

**Response**:
```typescript
{
  success: boolean;
  message: string;
  connectionTime?: number;  // Connection time in milliseconds
  publicIp?: string;  // Instance public IP
  ftpPort?: number;  // FTP port (default: 21)
}
```

**Example Response**:
```json
{
  "success": true,
  "message": "FTP credentials are valid",
  "connectionTime": 125,
  "publicIp": "203.0.113.1",
  "ftpPort": 21
}
```

**Error Responses**:
- `400`: Invalid username format
- `401`: Invalid credentials
- `404`: FTP account not found
- `500`: Failed to test connection

---

## SSM Command Execution Patterns

### Command Execution Flow

1. **Build SSM Client**: Create `SSMClient` with AWS credentials from server settings
2. **Resolve Instance ID**: Use provided instanceId or auto-detect from EC2 metadata
3. **Send Command**: Use `SendCommandCommand` with `AWS-RunShellScript` document
4. **Get Command ID**: Extract `CommandId` from response
5. **Poll Status**: Use `GetCommandInvocationCommand` to check status
6. **Parse Output**: Extract stdout/stderr from command response

### SSM Client Configuration

```typescript
import { SSMClient } from '@aws-sdk/client-ssm';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

private async buildSSMClient(): Promise<SSMClient> {
  const serverSettings = await this.serverSettingsProvider.getSettings();
  if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
    throw new Error('AWS credentials not configured');
  }

  const region = serverSettings.awsRegion ?? 'us-east-1';

  return new SSMClient({
    region,
    credentials: {
      accessKeyId: serverSettings.awsAccessKeyId,
      secretAccessKey: serverSettings.awsSecretAccessKey,
    },
  });
}
```

### Sending SSM Commands

```typescript
import { SendCommandCommand } from '@aws-sdk/client-ssm';

const client = await this.buildSSMClient();
const command = new SendCommandCommand({
  InstanceIds: [instanceId],
  DocumentName: 'AWS-RunShellScript',
  Comment: 'Create FTP account admin@example.com',
  Parameters: {
    commands: [
      '#!/bin/bash',
      'set -e',
      'echo "Creating FTP account..."',
      // ... command script
    ],
  },
  TimeoutSeconds: 120,
});

const response = await client.send(command);
const commandId = response.Command?.CommandId;

if (!commandId) {
  throw new Error('Failed to get command ID from SSM');
}

return { commandId, status: 'InProgress' };
```

### Polling Command Status

```typescript
import { GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

const client = await this.buildSSMClient();
const invocationResponse = await client.send(
  new GetCommandInvocationCommand({
    CommandId: commandId,
    InstanceId: instanceId,
  })
);

const status = invocationResponse.Status ?? 'Unknown';
const output = invocationResponse.StandardOutputContent;
const error = invocationResponse.StandardErrorContent;

return {
  status,  // "Success", "Failed", "Cancelled", "TimedOut", "InProgress", "Pending"
  output: output?.trim(),
  error: error?.trim(),
};
```

### Error Handling

**Common SSM Errors**:
- `InvalidInstanceId`: Instance not registered with SSM (agent not installed)
- `AccessDenied`: IAM role missing `AmazonSSMManagedInstanceCore` policy
- `ThrottlingException`: Too many requests (implement retry with exponential backoff)

**Error Response Format**:
```typescript
{
  status: 'Failed';
  error: string;  // Error message from stderr or SSM
  output?: string;  // Partial output before failure
}
```

---

## Frontend Implementation Patterns

### Polling Command Status

```typescript
const pollCommandStatus = async (commandId: string, maxAttempts = 60) => {
  let attempts = 0;
  
  const poll = async () => {
    if (attempts >= maxAttempts) {
      throw new Error('Command polling timed out');
    }
    
    attempts++;
    
    try {
      const status = await apiFetch<{
        status: string;
        output?: string;
        error?: string;
      }>(`domains/ftp/server/installation/${commandId}?instanceId=${instanceId}`);
      
      if (status.status === 'Success') {
        return status;
      } else if (status.status === 'Failed' || status.status === 'Cancelled' || status.status === 'TimedOut') {
        throw new Error(status.error || 'Command failed');
      } else {
        // Still in progress, poll again
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        return poll();
      }
    } catch (err) {
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return poll();
      }
      throw err;
    }
  };
  
  return poll();
};
```

### Loading FTP Accounts

```typescript
const loadFtpAccounts = async (domain: string) => {
  try {
    setIsLoadingFtp(true);
    setFtpError(null);
    
    const response = await apiFetch<{
      accounts: Array<FtpAccount>;
      domain: string;
      serverType: string;
      serverInstalled: boolean;
      serverRunning: boolean;
    }>(`domains/ftp/accounts?domain=${encodeURIComponent(domain)}&instanceId=${instanceId}`);
    
    setFtpAccounts(response.accounts);
    setFtpServerStatus({
      type: response.serverType,
      installed: response.serverInstalled,
      running: response.serverRunning,
    });
  } catch (err: any) {
    setFtpError(err.message || 'Failed to load FTP accounts');
    setFtpAccounts([]);
  } finally {
    setIsLoadingFtp(false);
  }
};
```

### Creating FTP Account

```typescript
const createFtpAccount = async (input: {
  localUsername: string;
  password: string;
  domain: string;
  homeDirectory?: string;
}) => {
  try {
    setIsCreatingFtp(true);
    setFtpError(null);
    
    const response = await apiFetch<{
      account: FtpAccount;
      commandId: string;
    }>(`domains/ftp/accounts?instanceId=${instanceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    
    // Poll for command completion
    await pollCommandStatus(response.commandId);
    
    // Reload accounts
    await loadFtpAccounts(input.domain);
    
    return response.account;
  } catch (err: any) {
    setFtpError(err.message || 'Failed to create FTP account');
    throw err;
  } finally {
    setIsCreatingFtp(false);
  }
};
```

---

## Security Considerations

### Domain Scoping

- **Strict Enforcement**: All FTP accounts are limited to their domain's document root
- **Path Validation**: Home directory must be within or equal to domain document root
- **Chroot**: All accounts use chroot to prevent access outside home directory

### Username Namespacing

- **Collision Prevention**: `@domain` format prevents username collisions
- **System Username Sanitization**: System usernames sanitized for `/etc/passwd` compatibility
- **Validation**: Username format validated on both frontend and backend

### Password Security

- **Minimum Length**: 8 characters required
- **Storage**: Passwords stored in `/etc/shadow` (system standard)
- **Transmission**: Passwords sent over HTTPS only

### SSM Security

- **IAM Role**: Instance must have `AmazonSSMManagedInstanceCore` policy
- **Credentials**: AWS credentials stored securely in server settings
- **Command Timeout**: All commands have appropriate timeouts
- **Error Handling**: Sensitive information not exposed in error messages

---

## Testing Considerations

### Unit Tests

1. **Username Sanitization**: Test conversion from `admin@example.com` to `admin_example_com`
2. **Domain Validation**: Test home directory path validation
3. **SSM Command Generation**: Test command script generation for vsftpd

### Integration Tests

1. **SSM Command Execution**: Test actual SSM command sending and polling
2. **FTP Account CRUD**: Test create, read, update, delete operations
3. **Error Scenarios**: Test SSM agent not installed, invalid credentials, etc.

### Manual Testing

1. **Install FTP Server**: Test vsftpd installation
2. **Create Accounts**: Test account creation with various usernames
3. **Test Connections**: Verify FTP connections work with created accounts
4. **Domain Isolation**: Verify accounts cannot access other domains' files

---

## Related Documentation

- AWS SSM Documentation: https://docs.aws.amazon.com/systems-manager/
- vsftpd Configuration: https://linux.die.net/man/5/vsftpd.conf
- vsftpd Official Documentation: https://security.appspot.com/vsftpd/vsftpd_conf.html

