# Agent Server Info Endpoints Specification

This document specifies the HTTP API endpoints that the JetCamer Agent must implement to provide server information and domain quota data. These endpoints replace the slow SSM-based operations.

## Base URL

```
http://<agent-ip>:9811
```

## Authentication

Currently, all endpoints are publicly accessible without authentication. Ensure the agent is deployed behind a firewall or reverse proxy with proper access controls.

## Content Type

All requests and responses use `application/json` content type.

---

## 1. Get Server Information

**Endpoint:** `GET /domains/server-info`

**Description:** Returns comprehensive server information including web server type, version, running status, all hosted domains with their configurations, and the instance's public IP address.

**Request:**

```http
GET /domains/server-info HTTP/1.1
Host: <agent-ip>:9811
```

**Response (200 OK):**

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
      "documentRoot": "/var/www/example.com/public_html",
      "sslEnabled": true,
      "sslCertificate": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "configPath": "/etc/nginx/sites-enabled/example.com"
    },
    {
      "domain": "test.com",
      "serverBlock": "test.com",
      "documentRoot": "/var/www/test.com/html",
      "sslEnabled": false,
      "configPath": "/etc/nginx/sites-enabled/test.com"
    }
  ],
  "publicIp": "44.248.12.249"
}
```

**Response Fields:**

- `instanceId` (string, required): EC2 instance ID (e.g., `"i-1234567890abcdef0"`)
- `webServer` (object, required): Web server information
  - `type` (string, required): One of `"nginx"`, `"apache"`, or `"none"`
  - `version` (string, optional): Web server version (e.g., `"1.18.0"`, `"2.4.41"`)
  - `isRunning` (boolean, required): Whether the web server service is running
- `domains` (array, required): List of hosted domains. **Must be an array** (can be empty `[]` if no domains are configured). **Only include domains that are actually configured on the server** (from web server configs or domain config files). Do not include domains from external DNS sources.
  - `domain` (string, required): Domain name (e.g., `"example.com"`)
  - `serverBlock` (string, required): Server name/block identifier (may include multiple domains, e.g., `"example.com www.example.com"`)
  - `documentRoot` (string, optional): Document root directory path
  - `sslEnabled` (boolean, required): Whether SSL/TLS is enabled
  - `sslCertificate` (string, optional): Path to SSL certificate file (if SSL enabled)
  - `configPath` (string, required): Path to web server configuration file
- `publicIp` (string, optional): Instance public IP address

**Response (500 Internal Server Error):**

```json
{
  "error": "Error message from server info check"
}
```

**Implementation Notes:**

1. **Web Server Detection:**
   - Check for Nginx: `systemctl is-active nginx` and `nginx -v`
   - Check for Apache: `systemctl is-active apache2` or `systemctl is-active httpd` and `apache2 -v` or `httpd -v`
   - If neither is found, return `type: "none"` and `isRunning: false`

2. **Domain Listing:**
   - **Important:** Only return domains that are **actually configured on the server**. Do not query external DNS services (Route53, etc.) or include domains that are not configured in web server configs.
   - **For Nginx:** Parse `/etc/nginx/sites-enabled/*` files
     - Extract `server_name` directive for domain names (may contain multiple domains separated by spaces)
     - Extract `root` directive for document root
     - Check for `ssl_certificate` directive to determine SSL status
     - If no domains are found, return empty array `[]`
   - **For Apache:** Parse `/etc/apache2/sites-enabled/*.conf` or `/etc/httpd/conf.d/*.conf` files
     - Extract `ServerName` directive for domain name
     - Extract `DocumentRoot` directive for document root
     - Check for `SSLEngine on` to determine SSL status
     - Extract `SSLCertificateFile` for certificate path
     - If no domains are found, return empty array `[]`
   - **If no web server is installed** (`type: "none"`), return empty array `[]` for domains

3. **Public IP:**
   - Use EC2 instance metadata: `curl -s http://169.254.169.254/latest/meta-data/public-ipv4`
   - Or use EC2 API if metadata is not available
   - Return `null` or omit field if IP cannot be determined

4. **Domain Config Files:**
   - The agent should also check `/etc/jetcamer/domains/*.json` files for domain configurations
   - These config files may contain additional domain metadata
   - Merge information from config files with web server config parsing

**Error Handling:**

- If web server detection fails, return `type: "none"` and `isRunning: false`
- If domain parsing fails for a specific domain, log the error but continue with other domains
- If public IP cannot be determined, omit the field (don't fail the entire request)
- If no domains are configured, return `domains: []` (empty array, not `null`)
- If `instanceId` cannot be determined, use EC2 instance metadata: `curl -s http://169.254.169.254/latest/meta-data/instance-id`

---

## 2. Get Domain Quota

**Endpoint:** `GET /domains/quota`

**Description:** Returns disk usage/quota information for a specific domain.

**Request:**

```http
GET /domains/quota?domain=example.com HTTP/1.1
Host: <agent-ip>:9811
```

**Query Parameters:**

- `domain` (required, string): Domain name (e.g., `example.com`)
- `documentRoot` (optional, string): Document root directory path. If not provided, derive from domain config or use default path

**Response (200 OK):**

```json
{
  "domain": "example.com",
  "used": 1073741824,
  "limit": 5368709120,
  "percentage": 20.0
}
```

**Response Fields:**

- `domain` (string, required): Domain name
- `used` (number, required): Disk space used in bytes
- `limit` (number, optional): Disk space limit in bytes (if quota is set)
- `percentage` (number, optional): Percentage of quota used (0-100)

**Response (400 Bad Request):**

```json
{
  "error": "domain is required"
}
```

**Response (404 Not Found):**

```json
{
  "error": "domain not found"
}
```

**Response (500 Internal Server Error):**

```json
{
  "error": "Error message from quota check"
}
```

**Implementation Notes:**

1. **Disk Usage Calculation:**
   - Use `du -sb <path>` to get disk usage in bytes
   - Path should be the document root directory or domain home directory
   - If `documentRoot` is provided, use it directly
   - If not provided, derive from:
     - Domain config file: `/etc/jetcamer/domains/{domain}.json` → `rootDirectory` or `ftp.homeDirectory`
     - Web server config: Parse nginx/apache config for the domain
     - Default: `/var/www/{domain}` or `/home/www/{domain}`

2. **Quota Limits:**
   - Check if domain has quota limits set (from domain config or system quotas)
   - Use `quota -u <user>` or filesystem quotas if available
   - Calculate percentage: `(used / limit) * 100`

3. **Error Handling:**
   - If path doesn't exist, return `used: 0`
   - If `du` command fails, return `used: 0` and log the error
   - If quota information is not available, omit `limit` and `percentage` fields

**Example Implementation (Bash):**

```bash
#!/bin/bash
domain=$1
documentRoot=$2

# Resolve document root if not provided
if [ -z "$documentRoot" ]; then
  # Try domain config file
  if [ -f "/etc/jetcamer/domains/${domain}.json" ]; then
    documentRoot=$(jq -r '.rootDirectory // .ftp.homeDirectory // empty' "/etc/jetcamer/domains/${domain}.json")
  fi
  
  # Fallback to default
  if [ -z "$documentRoot" ]; then
    documentRoot="/var/www/${domain}"
  fi
fi

# Get disk usage
if [ -d "$documentRoot" ]; then
  used=$(du -sb "$documentRoot" 2>/dev/null | cut -f1)
  used=${used:-0}
else
  used=0
fi

# Get quota limit if available (example)
limit=$(quota -u www-data 2>/dev/null | grep "$documentRoot" | awk '{print $2}' || echo "")

# Calculate percentage
if [ -n "$limit" ] && [ "$limit" -gt 0 ]; then
  percentage=$(awk "BEGIN {printf \"%.2f\", ($used / $limit) * 100}")
else
  percentage=""
fi

# Output JSON
echo "{\"domain\":\"$domain\",\"used\":$used,\"limit\":${limit:-null},\"percentage\":${percentage:-null}}"
```

---

## Integration with Domain Config Files

The agent should read domain configuration files from `/etc/jetcamer/domains/{domain}.json` to enrich the server info response. These files contain domain metadata that may not be present in web server configs.

**Domain Config File Structure:**

```json
{
  "domain": "example.com",
  "rootDirectory": "/home/www/example.com/public_html",
  "owner": "www-data",
  "group": "www-data",
  "ftp": {
    "allowed": true,
    "homeDirectory": "/home/www/example.com"
  },
  "webserver": {
    "type": "nginx",
    "configPath": "/etc/nginx/sites-enabled/example.com.conf"
  },
  "phpVersion": "8.2",
  "aliases": [
    "www.example.com"
  ]
}
```

**Priority for Information:**

1. Domain config file (`/etc/jetcamer/domains/{domain}.json`) - highest priority
2. Web server config files (nginx/apache) - fallback
3. Default values - last resort

**Important Notes:**

- **Domain Source:** Domains should **ONLY** come from what's actually configured on the server (web server configs or domain config files). Do not query external DNS services or include domains that aren't configured on the instance.
- **Empty Lists:** If no domains are configured, return an empty array `[]`, not `null` or an omitted field.
- **Instance ID:** The `instanceId` field should always be populated. Use EC2 instance metadata if not available from other sources.

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

## HTTP Status Codes

- `200 OK`: Request successful
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Resource not found (domain, etc.)
- `500 Internal Server Error`: Server error during operation

---

## Testing Checklist

Before deploying, verify:

- [ ] `GET /domains/server-info` returns correct web server type and version
- [ ] `GET /domains/server-info` returns `instanceId` field (from EC2 metadata if needed)
- [ ] `GET /domains/server-info` lists all domains from nginx configs
- [ ] `GET /domains/server-info` lists all domains from apache configs
- [ ] `GET /domains/server-info` returns empty array `[]` when no domains are configured
- [ ] `GET /domains/server-info` returns empty array `[]` when web server type is `"none"`
- [ ] `GET /domains/server-info` correctly identifies SSL-enabled domains
- [ ] `GET /domains/server-info` returns public IP address (or omits field if unavailable)
- [ ] `GET /domains/server-info` **only** includes domains from server configs (not external DNS)
- [ ] `GET /domains/quota?domain=example.com` returns correct disk usage
- [ ] `GET /domains/quota` handles missing documentRoot parameter
- [ ] `GET /domains/quota` handles non-existent domains gracefully
- [ ] Error responses are properly formatted
- [ ] All endpoints respond within 1-2 seconds

---

## Performance Requirements

- **Response Time:** Both endpoints should respond within 1-2 seconds
- **Caching:** Consider caching domain list and web server status for 5-10 seconds to improve performance
- **Parallel Processing:** Parse multiple domain configs in parallel where possible

---

---

## 3. Install Web Server

**Endpoint:** `POST /domains/web-server/install`

**Description:** Installs and configures a web server (Nginx or Apache) on the instance.

**Request:**

```http
POST /domains/web-server/install HTTP/1.1
Host: <agent-ip>:9811
Content-Type: application/json

{
  "type": "nginx",
  "httpPort": 80,
  "httpsPort": 443,
  "phpVersion": "8.2",
  "extras": "php8.2-fpm php8.2-mysql",
  "configureFirewall": true
}
```

**Request Body:**

```json
{
  "type": "nginx",              // Required: "nginx" or "apache"
  "httpPort": 80,               // Required: HTTP port number
  "httpsPort": 443,             // Required: HTTPS port number
  "phpVersion": "8.2",          // Optional: PHP version to install (e.g., "8.2", "8.1")
  "extras": "php8.2-fpm",       // Optional: Additional packages to install (space-separated)
  "configureFirewall": true      // Optional: Configure firewall rules (default: true)
}
```

**Response (200 OK):**

```json
{
  "commandId": "a1b2c3d4e5f6",
  "status": "InProgress"
}
```

**Response Fields:**

- `commandId` (string, required): Unique identifier to track installation progress
- `status` (string, required): Installation status (`"InProgress"`, `"Success"`, or `"Failed"`)

**Response (400 Bad Request):**

```json
{
  "error": "type is required"
}
```

or

```json
{
  "error": "httpPort is required"
}
```

**Response (500 Internal Server Error):**

```json
{
  "error": "Error message from installation"
}
```

**Implementation Notes:**

1. **Package Installation:**
   - **Nginx:** `apt install -y nginx` (Ubuntu/Debian) or `yum install -y nginx` (CentOS/RHEL)
   - **Apache:** `apt install -y apache2` (Ubuntu/Debian) or `yum install -y httpd` (CentOS/RHEL)
   - Enable and start service: `systemctl enable <service>` and `systemctl start <service>`

2. **Port Configuration:**
   - **Nginx:** Update `/etc/nginx/sites-available/default` and `/etc/nginx/nginx.conf`
   - **Apache:** Update `/etc/apache2/ports.conf` (Ubuntu/Debian) or `/etc/httpd/conf/httpd.conf` (CentOS/RHEL)
   - If custom ports are specified, update configuration files accordingly

3. **PHP-FPM Installation (if specified):**
   - Install PHP-FPM: `apt install -y php{version}-fpm` or `yum install -y php-fpm`
   - Enable and start PHP-FPM service
   - Configure web server to use PHP-FPM socket

4. **Extra Packages:**
   - Install any additional packages specified in `extras` field
   - Packages should be space-separated

5. **Firewall Configuration:**
   - If `configureFirewall: true`, configure firewall rules:
     - `ufw allow {httpPort}/tcp` (Ubuntu/Debian)
     - `firewall-cmd --add-port={httpPort}/tcp --permanent` (CentOS/RHEL)
     - Same for HTTPS port
     - Reload firewall: `firewall-cmd --reload` (CentOS/RHEL)

6. **Service Verification:**
   - Verify installation: `systemctl status <service>`
   - Test configuration: `nginx -t` or `apache2ctl configtest`
   - Restart service if needed

**Note:** Installation runs asynchronously. Use the `commandId` to check installation status via the status endpoint.

---

## 4. Get Web Server Installation Status

**Endpoint:** `GET /domains/web-server/installation/{commandId}`

**Description:** Check the status of an ongoing or completed web server installation.

**Request:**

```http
GET /domains/web-server/installation/a1b2c3d4e5f6 HTTP/1.1
Host: <agent-ip>:9811
```

**Response (200 OK) - In Progress:**

```json
{
  "status": "InProgress"
}
```

**Response (200 OK) - Success:**

```json
{
  "status": "Success",
  "output": "Nginx installed and running successfully\nnginx version: nginx/1.18.0",
  "exitCode": 0
}
```

**Response (200 OK) - Failed:**

```json
{
  "status": "Failed",
  "output": "Installation output...",
  "error": "Error messages...",
  "exitCode": 1
}
```

**Response (404 Not Found):**

```json
{
  "error": "command not found"
}
```

**Status Values:**

- `InProgress`: Installation is still running
- `Success`: Installation completed successfully
- `Failed`: Installation failed

---

## 5. Uninstall Web Server

**Endpoint:** `POST /domains/web-server/uninstall`

**Description:** Uninstalls a web server (Nginx or Apache) from the instance.

**Request:**

```http
POST /domains/web-server/uninstall HTTP/1.1
Host: <agent-ip>:9811
Content-Type: application/json

{
  "type": "nginx",
  "removeConfig": false
}
```

**Request Body:**

```json
{
  "type": "nginx",              // Required: "nginx" or "apache"
  "removeConfig": false         // Optional: Remove configuration files (default: false)
}
```

**Response (200 OK):**

```json
{
  "commandId": "f6e5d4c3b2a1",
  "status": "InProgress"
}
```

**Response Fields:**

- `commandId` (string, required): Unique identifier to track uninstallation progress
- `status` (string, required): Uninstallation status

**Response (400 Bad Request):**

```json
{
  "error": "type is required"
}
```

**Response (500 Internal Server Error):**

```json
{
  "error": "Error message from uninstallation"
}
```

**Implementation Notes:**

1. **Service Stop:**
   - Stop service: `systemctl stop nginx` or `systemctl stop apache2` / `systemctl stop httpd`
   - Disable service: `systemctl disable nginx` or `systemctl disable apache2` / `systemctl disable httpd`

2. **Package Removal:**
   - **Nginx:** `apt remove -y nginx nginx-common nginx-core` or `yum remove -y nginx`
   - **Apache:** `apt remove -y apache2 apache2-utils apache2-bin` or `yum remove -y httpd`
   - Purge packages: `apt purge -y nginx*` or `apt purge -y apache2*` (Ubuntu/Debian)

3. **Configuration Cleanup:**
   - If `removeConfig: true`, remove configuration directories:
     - Nginx: `/etc/nginx`
     - Apache: `/etc/apache2` (Ubuntu/Debian) or `/etc/httpd` (CentOS/RHEL)
   - Remove web root content: `/var/www/html/*` (optional, be careful)
   - Remove log files: `/var/log/nginx` or `/var/log/apache2` / `/var/log/httpd`

4. **PHP-FPM Removal:**
   - Stop and remove PHP-FPM if installed
   - Remove PHP packages: `apt remove -y php*-fpm php*-cli` or `yum remove -y php-fpm php-cli`

**Note:** Uninstallation runs asynchronously. Use the `commandId` to check uninstallation status via the status endpoint.

---

## 6. Get Web Server Uninstallation Status

**Endpoint:** `GET /domains/web-server/uninstallation/{commandId}`

**Description:** Check the status of an ongoing or completed web server uninstallation.

**Request:**

```http
GET /domains/web-server/uninstallation/f6e5d4c3b2a1 HTTP/1.1
Host: <agent-ip>:9811
```

**Response (200 OK) - In Progress:**

```json
{
  "status": "InProgress"
}
```

**Response (200 OK) - Success:**

```json
{
  "status": "Success",
  "output": "Nginx uninstalled successfully",
  "exitCode": 0
}
```

**Response (200 OK) - Failed:**

```json
{
  "status": "Failed",
  "output": "Uninstallation output...",
  "error": "Error messages...",
  "exitCode": 1
}
```

**Response (404 Not Found):**

```json
{
  "error": "command not found"
}
```

**Status Values:**

- `InProgress`: Uninstallation is still running
- `Success`: Uninstallation completed successfully
- `Failed`: Uninstallation failed

---



