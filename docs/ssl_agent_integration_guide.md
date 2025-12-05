# SSL Certificate Management - Complete Integration Guide

**For Web Team Integration**  
**Last Updated:** December 2, 2025  
**Status:** Production Ready  

---

## Table of Contents

1. [Quick Start (5 minutes)](#quick-start)
2. [API Reference](#api-reference)
3. [Webhook DNS Setup (For Auto-Renewal)](#webhook-dns-setup)
4. [Auto-Renewal Implementation](#auto-renewal-implementation)
5. [Error Handling](#error-handling)
6. [Testing](#testing)
7. [Production Deployment](#production-deployment)

---

## Quick Start

### Agent URL

```javascript
const AGENT_URL = 'http://{AGENT_IP}:9811';
// Replace {AGENT_IP} with your agent server IP
```

### One-Time Setup: Configure ACME Account

```javascript
// Do this ONCE per agent installation
await axios.post(`${AGENT_URL}/agent/ssl/acme-account`, {
  email: 'admin@yourdomain.com',
  useStaging: false  // true for testing, false for production
});
```

### (Optional) Verify DNS Before Issuing Certificate

```javascript
// Pre-flight check: Verify domain resolves before SSL issuance
const dns = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
  params: { hostname: 'example.com', type: 'A' }
});

if (dns.data.count > 0) {
  console.log(`✓ DNS configured: ${dns.data.records.map(r => r.value).join(', ')}`);
} else {
  console.error('✗ DNS not configured for example.com');
  // Fix DNS before proceeding
}
```

### Issue Your First Certificate (HTTP-01)

```javascript
const axios = require('axios');

// Issue certificate
const response = await axios.post(`${AGENT_URL}/agent/ssl/issue`, {
  domain: 'example.com'
});

console.log(response.data);
// {
//   "domain": "example.com",
//   "issuedAt": "2025-12-02T09:32:59Z",
//   "expiresAt": "2026-03-02T09:32:58Z",
//   "issuer": "R13",
//   "status": "active"
// }
```

**Result:** Certificate for `example.com` + `www.example.com` (automatic)  
**Location:** `/etc/letsencrypt/live/example.com/`  
**Auto-Renewal:** ✅ YES (handled by agent automatically - no backend code needed!)

---

## API Reference

### Base URL

```
http://{AGENT_IP}:9811/agent/ssl
```

Replace `{AGENT_IP}` with your agent server IP.

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agent/ssl/issue` | POST | Issue new certificate |
| `/agent/ssl/renew` | POST | Renew certificate (manual) |
| `/agent/ssl` | GET | List certificates |
| `/agent/ssl/health` | GET | Certificate health/expiry |
| `/agent/ssl/download` | GET | Download certificate bundle |
| `/agent/ssl/revoke` | DELETE | Revoke certificate |
| `/agent/ssl/auto-renewal/status` | GET | Auto-renewal status |
| `/agent/ssl/auto-renewal/trigger` | POST | Trigger renewal check |
| `/agent/dns/lookup` | GET | DNS lookup (all record types) |

---

### 1. Issue Certificate

**Endpoint:** `POST /agent/ssl/issue`

#### Option A: HTTP-01 (Standard - Recommended)

**Request:**
```json
{
  "domain": "example.com"
}
```

**Response:**
```json
{
  "domain": "example.com",
  "issuedAt": "2025-12-02T09:32:59Z",
  "expiresAt": "2026-03-02T09:32:58Z",
  "issuer": "R13",
  "status": "active",
  "webServer": "apache",
  "managedBy": "jetcamer",
  "acmeEnvironment": "production",
  "acmeAccountEmail": "user_acme_email"
}
```

**What you get:**
- Certificate for `example.com` AND `www.example.com`
- Auto-renewal: ✅ YES (automatic - agent handles it!)
- Wildcard: ❌ NO

#### Option B: DNS-01 with Webhook (For Wildcards)

**Request:**
```json
{
  "domain": "example.com",
  "altNames": ["*.example.com"],
  "challengeType": "dns",
  "dnsProvider": {
    "provider": "webhook",
    "credentials": {
      "WEBHOOK_PRESENT_URL": "https://api.yourservice.com/acme/dns/present",
      "WEBHOOK_CLEANUP_URL": "https://api.yourservice.com/acme/dns/cleanup",
      "WEBHOOK_AUTH_HEADER": "Bearer your-secret-token",
      "WEBHOOK_WAIT_SECONDS": "60"
    }
  }
}
```

**Response:** Same format as HTTP-01

**What you get:**
- Certificate for `example.com` AND `*.example.com` (all subdomains!)
- Auto-renewal: ✅ YES (automatic - agent handles it with stored webhook config!)
- Wildcard: ✅ YES

---

### 2. Renew Certificate

**Endpoint:** `POST /agent/ssl/renew`

**Request (HTTP-01):**
```json
{
  "domain": "example.com"
}
```

**Request (DNS-01):**
```json
{
  "domain": "example.com",
  "challengeType": "dns",
  "dnsProvider": {
    "provider": "webhook",
    "credentials": {
      "WEBHOOK_PRESENT_URL": "https://api.yourservice.com/acme/dns/present",
      "WEBHOOK_AUTH_HEADER": "Bearer your-secret-token" (optional)
    }
  }
}
```

**Note:** Use the same challenge type and credentials as the original issuance.

---

### 3. List Certificates

**Endpoint:** `GET /agent/ssl`

**Response:**
```json
[
  {
    "domain": "example.com",
    "issuedAt": "2025-12-02T09:32:59Z",
    "expiresAt": "2026-03-02T09:32:58Z",
    "issuer": "R13",
    "status": "active",
    "webServer": "apache",
    "managedBy": "jetcamer"
  }
]
```

**Filter by domain:**
```
GET /agent/ssl?domain=example
```

Returns all certificates with "example" in the domain name.

---

### 4. Check Certificate Health

**Endpoint:** `GET /agent/ssl/health`

**Response:**
```json
{
  "timestamp": "2025-12-02T14:30:00Z",
  "items": [
    {
      "domain": "example.com",
      "issuedAt": "2025-12-02T09:32:59Z",
      "expiresAt": "2026-03-02T09:32:58Z",
      "issuer": "R13",
      "status": "active",
      "daysToExpiry": 89
    }
  ]
}
```

**Use case:** Find certificates needing renewal
```javascript
const expiring = response.items.filter(cert => cert.daysToExpiry < 30);
```

---

### 5. Download Certificate

**Endpoint:** `GET /agent/ssl/download?domain={domain}&format={format}`

**Parameters:**
- `domain` (required): Domain name
- `format` (optional): `json`, `pem`, or `zip` (default: `json`)

**Example:**
```
GET /agent/ssl/download?domain=example.com&format=json
```

**Response (JSON format):**
```json
{
  "domain": "example.com",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "privateKey": "-----BEGIN PRIVATE KEY-----\n...",
  "fullchain": "-----BEGIN CERTIFICATE-----\n...",
  "issuedAt": "2025-12-02T09:32:59Z",
  "expiresAt": "2026-03-02T09:32:58Z",
  "issuer": "R13"
}
```

---

## Webhook DNS Setup (To be implemented at the user-specified enpoints)
There should be a question mark that would open a popup modal explaining to the user how each of the endpoints should be implemented

### Why Use Webhook DNS?

✅ **Wildcard certificates** (`*.example.com`)  
✅ **Auto-renewal** (same as Route53/Cloudflare)  
✅ **Works with ANY DNS provider** (WHM, GoDaddy, etc.)  
✅ **Uses your existing DNS code**  

### What You Need to Implement

**Two webhook endpoints** that handle DNS TXT record operations:

#### 1. Present Endpoint (Create TXT Record)

```javascript
// In backend/server.js or routes file

app.post('/acme/dns/present', async (req, res) => {
  // 1. Authenticate
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ACME_WEBHOOK_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  // 2. Extract payload
  const { recordName, recordValue, zone } = req.body;
  
  // 3. Parse subdomain from recordName
  // "_acme-challenge.app.example.com." → "_acme-challenge.app"
  const name = recordName
    .replace(`.${zone}.`, '')
    .replace(`.${zone}`, '')
    .replace(/\.$/, '');
  
  // 4. Create TXT record in your DNS provider
  try {
    // Use your existing DNS function
    await yourDNS.createTXTRecord({
      zone: zone,           // e.g., "example.com"
      name: name,           // e.g., "_acme-challenge.app"
      value: recordValue,   // e.g., "xYz123AbC456..."
      ttl: 300
    });
    
    res.json({ success: true, message: 'TXT record created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

#### 2. Cleanup Endpoint (Delete TXT Record)

```javascript
app.post('/acme/dns/cleanup', async (req, res) => {
  // Authenticate
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ACME_WEBHOOK_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  const { recordName, zone } = req.body;
  const name = recordName.replace(`.${zone}.`, '').replace(`.${zone}`, '').replace(/\.$/, '');
  
  try {
    await yourDNS.deleteTXTRecord({ zone, name });
    res.json({ success: true, message: 'TXT record deleted' });
  } catch (error) {
    // Don't fail cleanup - record might not exist
    res.json({ success: true, message: 'Cleanup complete' });
  }
});
```

### Webhook Payload Format

**Your endpoints will receive:**

```json
{
  "domain": "app.example.com",
  "recordName": "_acme-challenge.app.example.com.",
  "recordValue": "xYz123AbC456DeF789GhI012JkL345MnO678PqR901StU234VwX567",
  "fqdn": "_acme-challenge.app.example.com.",
  "zone": "example.com"
}
```

**Your endpoints must return:**

```json
{
  "success": true,
  "message": "Operation completed"
}
```

---

## Auto-Renewal Implementation

### ✨ **GOOD NEWS: The Agent Handles Auto-Renewal Automatically!**

The Go agent **automatically renews certificates** without any backend code needed! When you issue a certificate (HTTP-01, DNS-01 with Route53, Cloudflare, or Webhook), the agent:

1. **Stores the renewal configuration** (challenge type, DNS provider credentials)
2. **Checks daily** for certificates expiring within 30 days
3. **Automatically renews** them using the stored configuration
4. **Retries** up to 3 times if renewal fails

**You don't need to implement any renewal logic in your backend!**

### Auto-Renewal Configuration (Built-in)

The agent is pre-configured with optimal settings:
- **Check Interval:** Every 24 hours
- **Renewal Threshold:** 30 days before expiry
- **Max Retries:** 3 attempts with exponential backoff
- **Supported:** HTTP-01, DNS-01 (Route53, Cloudflare, Webhook)

### Check Auto-Renewal Status (Optional)

If you want to monitor the auto-renewal system:

```javascript
// Check auto-renewal status
const status = await axios.get(`${AGENT_URL}/agent/ssl/auto-renewal/status`);
console.log(status.data);
// {
//   "enabled": true,
//   "running": true,
//   "checkInterval": "24h0m0s",
//   "renewalThreshold": 30,
//   "maxRetries": 3
// }
```

### Manually Trigger Renewal Check (Optional)

You can manually trigger a renewal check anytime:

```javascript
// Manually trigger renewal check (runs in background)
await axios.post(`${AGENT_URL}/agent/ssl/auto-renewal/trigger`);
// {
//   "status": "triggered",
//   "message": "Auto-renewal check started in background"
// }
```

### Legacy Manual Renewal (Still Supported)

If you prefer manual control, you can still call the renewal endpoint directly:

```javascript
// Manual renewal for HTTP-01 certificate
await axios.post(`${AGENT_URL}/agent/ssl/renew`, {
  domain: 'example.com'
});

// Manual renewal for DNS-01 certificate (must provide same config as issuance)
await axios.post(`${AGENT_URL}/agent/ssl/renew`, {
  domain: 'example.com',
  challengeType: 'dns',
  dnsProvider: {
    provider: 'webhook',
    credentials: {
      WEBHOOK_PRESENT_URL: 'https://api.yourservice.com/acme/dns/present',
      WEBHOOK_AUTH_HEADER: 'Bearer your-token'
    }
  }
});
```

---

## Error Handling

### Common Errors

**400 Bad Request:**
```json
{"error": "domain is required"}
```
Fix: Provide required fields

**404 Not Found:**
```json
{"error": "certificate not found for domain example.com"}
```
Fix: Certificate doesn't exist, issue it first

**500 Internal Server Error:**
```text
error: one or more domains had a problem:
[example.com] acme: error presenting token: ...
```
Fix: Check agent logs, verify DNS/port 80 access

### Error Handling Pattern

```javascript
async function issueCertificateSafely(domain, config) {
  try {
    const response = await axios.post(`${AGENT_URL}/agent/ssl/issue`, config);
    return { success: true, data: response.data };
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    
    console.error(`[SSL] Failed for ${domain}:`, errorMsg);
    
    // Handle specific errors
    if (errorMsg.includes('bind: address already in use')) {
      return { success: false, error: 'Port 80 conflict - use DNS challenge' };
    }
    
    if (errorMsg.includes('403') || errorMsg.includes('401')) {
      return { success: false, error: 'Authentication failed' };
    }
    
    if (errorMsg.includes('rate limit')) {
      return { success: false, error: 'Rate limit exceeded - try staging or wait' };
    }
    
    return { success: false, error: errorMsg };
  }
}
```

---

## Testing

### Test Agent Connection

```bash
curl http://{AGENT_IP}:9811/health
# Expected: "ok"
```

### Test ACME Account

```bash
curl http://{AGENT_IP}:9811/agent/ssl/acme-account
# Expected: {"email":"...","configured":true}
```

### Test Certificate Issuance

```bash
curl -X POST http://{AGENT_IP}:9811/agent/ssl/issue \
  -H "Content-Type: application/json" \
  -d '{"domain":"test.yourdomain.com"}'
```

### Test Webhook Endpoints (If Using DNS-01)

```bash
# Test present endpoint
curl -X POST https://api.yourservice.com/acme/dns/present \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{
    "domain": "test.example.com",
    "recordName": "_acme-challenge.test.example.com.",
    "recordValue": "test-value-123",
    "zone": "example.com"
  }'

# Expected: {"success": true}

# Verify TXT record created
dig +short TXT _acme-challenge.test.example.com
# Expected: "test-value-123"

# Test cleanup
curl -X POST https://api.yourservice.com/acme/dns/cleanup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{
    "domain": "test.example.com",
    "recordName": "_acme-challenge.test.example.com.",
    "zone": "example.com"
  }'

# Expected: {"success": true}
```

---

## Production Deployment

### Environment Variables

```bash
# Your backend
export ACME_WEBHOOK_SECRET="randomly-generated-secret-here"
export AGENT_IP="instance_ip"  # Your agent server IP

# Generate random secret
export ACME_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

### Integration Checklist

#### Phase 1: Basic SSL (15 minutes)
- [ ] Set `AGENT_IP` environment variable
- [ ] Configure ACME account (one-time)
- [ ] Test HTTP-01 certificate issuance
- [ ] Integrate `issueCertificate()` function
- [ ] Test in development

#### Phase 2: Webhook DNS (30 minutes) - Optional
- [ ] Add webhook endpoints to backend
- [ ] Set `ACME_WEBHOOK_SECRET`
- [ ] Test webhook endpoints manually
- [ ] Test wildcard certificate issuance
- [ ] Verify TXT record creation/deletion

#### Phase 3: Auto-Renewal (Already Done! ✅)
- [x] Auto-renewal is **built into the agent** - no code needed!
- [x] Agent automatically renews certificates 30 days before expiry
- [x] Works for HTTP-01, Route53, Cloudflare, and Webhook DNS
- [ ] (Optional) Implement monitoring dashboard using `/agent/ssl/auto-renewal/status`
- [ ] (Optional) Set up notifications for failed renewals by polling `/agent/ssl/health`

---

## Complete Code Example

### SSL Manager Class (Production-Ready)

```javascript
const axios = require('axios');
const schedule = require('node-schedule');

class SSLManager {
  constructor(agentIP, db) {
    this.agentUrl = `http://${agentIP}:9811`;
    this.db = db;
    this.webhookSecret = process.env.ACME_WEBHOOK_SECRET;
  }
  
  // Issue standard certificate (HTTP-01)
  async issueStandard(domain) {
    const response = await axios.post(`${this.agentUrl}/agent/ssl/issue`, {
      domain
    });
    
    // Save renewal config
    await this.db.collection('ssl_renewal').updateOne(
      { domain },
      { $set: { domain, challengeType: 'http', lastIssued: new Date() } },
      { upsert: true }
    );
    
    return response.data;
  }
  
  // Issue wildcard certificate (Webhook DNS)
  async issueWildcard(domain) {
    const webhookConfig = {
      WEBHOOK_PRESENT_URL: 'https://api.yourservice.com/acme/dns/present',
      WEBHOOK_CLEANUP_URL: 'https://api.yourservice.com/acme/dns/cleanup',
      WEBHOOK_AUTH_HEADER: `Bearer ${this.webhookSecret}`
    };
    
    const response = await axios.post(`${this.agentUrl}/agent/ssl/issue`, {
      domain,
      altNames: [`*.${domain}`],
      challengeType: 'dns',
      dnsProvider: {
        provider: 'webhook',
        credentials: webhookConfig
      }
    });
    
    // Save renewal config
    await this.db.collection('ssl_renewal').updateOne(
      { domain },
      { 
        $set: { 
          domain, 
          challengeType: 'dns',
          dnsProvider: { provider: 'webhook', credentials: webhookConfig },
          lastIssued: new Date(),
          includesWildcard: true
        } 
      },
      { upsert: true }
    );
    
    return response.data;
  }
  
  // List all certificates
  async list() {
    const response = await axios.get(`${this.agentUrl}/agent/ssl`);
    return response.data;
  }
  
  // Get health/expiry info
  async getHealth() {
    const response = await axios.get(`${this.agentUrl}/agent/ssl/health`);
    return response.data;
  }
  
  // Download certificate
  async download(domain, format = 'json') {
    const response = await axios.get(`${this.agentUrl}/agent/ssl/download`, {
      params: { domain, format }
    });
    return response.data;
  }
  
  // Renew certificate
  async renew(domain) {
    const config = await this.db.collection('ssl_renewal').findOne({ domain });
    
    if (!config) {
      return axios.post(`${this.agentUrl}/agent/ssl/renew`, { domain });
    }
    
    const renewRequest = config.challengeType === 'dns'
      ? {
          domain,
          challengeType: 'dns',
          dnsProvider: config.dnsProvider
        }
      : { domain };
    
    const response = await axios.post(`${this.agentUrl}/agent/ssl/renew`, renewRequest);
    
    // Update last renewed
    await this.db.collection('ssl_renewal').updateOne(
      { domain },
      { $set: { lastRenewed: new Date() } }
    );
    
    return response.data;
  }
  
  // Auto-renew expiring certificates
  async renewExpiring() {
    const health = await this.getHealth();
    const expiring = health.items.filter(cert => cert.daysToExpiry < 30);
    
    const results = [];
    for (const cert of expiring) {
      try {
        const renewed = await this.renew(cert.domain);
        results.push({ domain: cert.domain, success: true, data: renewed });
      } catch (error) {
        results.push({ domain: cert.domain, success: false, error: error.message });
      }
    }
    
    return results;
  }
  
  // Start auto-renewal scheduler
  startScheduler() {
    // Check daily at 2 AM
    schedule.scheduleJob('0 2 * * *', async () => {
      console.log('[SSL] Running scheduled certificate renewal check...');
      const results = await this.renewExpiring();
      
      const renewed = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      console.log(`[SSL] Renewal complete: ${renewed.length} success, ${failed.length} failed`);
      
      if (failed.length > 0) {
        // Send alert
        console.error('[SSL] Failed renewals:', failed);
      }
    });
    
    console.log('[SSL] Auto-renewal scheduler started (daily at 2 AM)');
  }
}

// Usage
const sslManager = new SSLManager(process.env.AGENT_IP, yourDatabase);

// Start auto-renewal
sslManager.startScheduler();

// Issue standard certificate
await sslManager.issueStandard('example.com');

// Issue wildcard certificate
await sslManager.issueWildcard('example.com');

// Manual renewal
await sslManager.renew('example.com');

module.exports = SSLManager;
```

---

## Quick Reference

### HTTP-01 (Standard Certificates)

```javascript
// Issue
POST /agent/ssl/issue
{ "domain": "example.com" }

// Result: example.com + www.example.com
// Auto-renewal: ✅ YES
```

### DNS-01 Webhook (Wildcard Certificates)

```javascript
// Issue
POST /agent/ssl/issue
{
  "domain": "example.com",
  "altNames": ["*.example.com"],
  "challengeType": "dns",
  "dnsProvider": {
    "provider": "webhook",
    "credentials": {
      "WEBHOOK_PRESENT_URL": "https://api.yourservice.com/acme/dns/present",
      "WEBHOOK_AUTH_HEADER": "Bearer secret"
    }
  }
}

// Result: example.com + *.example.com
// Auto-renewal: ✅ YES
```

### List & Monitor

```javascript
// List all
GET /agent/ssl

// Check health
GET /agent/ssl/health

// Download
GET /agent/ssl/download?domain=example.com&format=json
```

### Renewal

```javascript
// Renew (same payload as issuance)
POST /agent/ssl/renew
{same configuration as issue}
```

---

## FAQ

**Q: What is `{AGENT_IP}`?**  
A: Your agent server IP address. Replace with actual instance IP

**Q: Can certificates auto-renew?**  
A: Yes! The agent automatically handles renewal for HTTP-01, Route53, Cloudflare, and Webhook. No backend code required!

**Q: Do I need to implement webhooks?**  
A: Only if you want wildcard certificates. For standard certs, HTTP-01 works without webhooks.

**Q: How do wildcard certificates work?**  
A: Use DNS-01 challenge (webhook provider). One certificate covers `example.com` and `*.example.com` (all subdomains).

**Q: Where are certificates stored?**  
A: `/etc/letsencrypt/live/{domain}/` - Standard location, survives agent uninstalls.

**Q: What if renewal fails?**  
A: Check agent logs: `journalctl -u jetcamer-agent -f`. Certificate is still valid for 60 days after renewal starts.

**Q: Can I use different challenge methods for different domains?**  
A: Yes! Use HTTP-01 for some, DNS-01 for others. Store the method in your database.

**Q: What's the difference between providers?**  
A: 
- **HTTP-01**: No wildcards, auto-renews (agent handles it)
- **Webhook DNS**: Wildcards, auto-renews (agent handles it), works with ANY DNS
- **Route53/Cloudflare**: Wildcards, auto-renews (agent handles it), specific DNS providers
- **Manual**: Wildcards, NO auto-renewal (testing only, manual intervention required)

---

## Support

### Documentation
- This guide (complete reference)
- `WEBHOOK_DNS_PROVIDER.md` - Webhook deep dive (if needed)
- `AUTO_RENEWAL_GUIDE.md` - Renewal details (if needed)

### Debugging
- Agent logs: `journalctl -u jetcamer-agent -f`
- Agent health: `curl http://{AGENT_IP}:9811/health`
- Certificate list: `curl http://{AGENT_IP}:9811/agent/ssl`

### Test Scripts (Optional)
- `backend/cyber-agent/agent-go/scripts/test-ssl-http01.sh`
- `backend/cyber-agent/agent-go/scripts/test-ssl-all-webservers.sh`

---

## Summary

**This one document provides everything your web team needs:**

✅ **Quick start** - Issue first certificate in 5 minutes  
✅ **Complete API reference** - All endpoints documented  
✅ **Webhook setup** - For wildcard support  
✅ **Auto-renewal** - **Built into agent, no code needed!** 🎉  
✅ **Error handling** - Common issues and fixes  
✅ **Testing guide** - Verify everything works  
✅ **Production checklist** - Deployment steps  

**Integration time:** ~30 minutes for complete setup (no renewal code needed!)  
**Benefit:** Fully automated SSL with wildcard support forever! ♾️

---

**This is the ONLY document the web team needs for integration.** ✅

