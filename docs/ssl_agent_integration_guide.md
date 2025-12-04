# JetCamer Agent - Web Team Integration Guide

**Complete guide for integrating with the JetCamer agent's SSL and DNS APIs**

---

## Quick Start

### Agent URL

```javascript
const AGENT_URL = 'http://{AGENT_IP}:9811';
// Replace {AGENT_IP} with your agent server IP
```

### One-Time Setup

```javascript
// 1. Configure ACME account (one-time per agent)
await axios.post(`${AGENT_URL}/agent/ssl/acme-account`, {
  email: 'services@jetcamer.com',
  useStaging: false  // true for testing, false for production
});
```

---

## SSL Certificate Management

### Issue Standard Certificate (HTTP-01)

```javascript
const response = await axios.post(`${AGENT_URL}/agent/ssl/issue`, {
  domain: 'example.com'
});

// Result: Certificate for example.com + www.example.com
// Auto-renewal: ✅ Enabled automatically
```

### Issue Wildcard Certificate (DNS-01 with Webhook)

```javascript
const response = await axios.post(`${AGENT_URL}/agent/ssl/issue`, {
  domain: 'example.com',
  altNames: ['*.example.com'],
  challengeType: 'dns',
  dnsProvider: {
    provider: 'webhook',
    credentials: {
      WEBHOOK_PRESENT_URL: 'https://api.yourservice.com/acme/dns/present',
      WEBHOOK_CLEANUP_URL: 'https://api.yourservice.com/acme/dns/cleanup',
      WEBHOOK_AUTH_HEADER: 'Bearer your-secret-token'
    }
  }
});

// Result: Certificate for example.com + *.example.com (all subdomains)
// Auto-renewal: ✅ Enabled automatically with stored webhook config
```

### Check Certificate Health

```javascript
const health = await axios.get(`${AGENT_URL}/agent/ssl/health`);

// Find certificates expiring soon
const expiring = health.data.items.filter(cert => cert.daysToExpiry < 30);
console.log(`${expiring.length} certificates need renewal`);
```

### Download Certificate

```javascript
const cert = await axios.get(`${AGENT_URL}/agent/ssl/download`, {
  params: {
    domain: 'example.com',
    format: 'json'  // or 'pem', 'zip'
  }
});

// cert.data contains: certificate, privateKey, fullchain, expiresAt, etc.
```

---

## DNS Lookup API

### Basic DNS Resolution

```javascript
// A records (IPv4) - Default
const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
  params: { hostname: 'example.com' }
});

console.log('IPs:', response.data.records.map(r => r.value));
// Output: ["93.184.216.34"]
```

### All Record Types

```javascript
// TXT records (ACME challenges, SPF, DKIM)
const txt = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
  params: { hostname: 'example.com', type: 'TXT' }
});

// MX records (mail servers)
const mx = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
  params: { hostname: 'example.com', type: 'MX' }
});

// NS records (nameservers)
const ns = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
  params: { hostname: 'example.com', type: 'NS' }
});

// CNAME records (aliases)
const cname = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
  params: { hostname: 'www.example.com', type: 'CNAME' }
});
```

### Supported Record Types

| Type | Description | Use Case |
|------|-------------|----------|
| `A` | IPv4 addresses | Standard domain resolution |
| `AAAA` | IPv6 addresses | IPv6 connectivity |
| `TXT` | Text records | ACME challenges, SPF, DKIM |
| `MX` | Mail servers | Email configuration |
| `NS` | Nameservers | Delegation verification |
| `CNAME` | Aliases | Subdomain configuration |
| `SOA`, `SRV`, `PTR`, `ANY` | Other types | Advanced DNS queries |

---

## Common Integration Patterns

### Pattern 1: Pre-Flight DNS Check Before SSL

```javascript
async function issueCertificateWithValidation(domain) {
  // Step 1: Verify DNS is configured
  const dnsCheck = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { hostname: domain, type: 'A' }
  });
  
  if (dnsCheck.data.count === 0) {
    throw new Error(`DNS not configured for ${domain}. Please add A record first.`);
  }
  
  const ips = dnsCheck.data.records.map(r => r.value);
  console.log(`✓ ${domain} resolves to: ${ips.join(', ')}`);
  
  // Step 2: Issue certificate
  const cert = await axios.post(`${AGENT_URL}/agent/ssl/issue`, {
    domain
  });
  
  console.log(`✓ Certificate issued for ${domain}`);
  return cert.data;
}

// Usage
await issueCertificateWithValidation('app.example.com');
```

### Pattern 2: Verify Webhook DNS-01 Challenge

```javascript
async function verifyACMEChallenge(domain, expectedValue) {
  const challengeHost = `_acme-challenge.${domain}`;
  
  // Poll DNS until TXT record appears (webhook may take time)
  for (let i = 0; i < 10; i++) {
    const txt = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
      params: { hostname: challengeHost, type: 'TXT' }
    });
    
    const found = txt.data.records.some(r => r.value === expectedValue);
    if (found) {
      console.log(`✓ ACME challenge TXT record verified`);
      return true;
    }
    
    // Wait 5 seconds before retry
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('ACME challenge TXT record not found after 50 seconds');
}

// Usage (after calling webhook present endpoint)
await webhookPresent({
  recordName: '_acme-challenge.example.com',
  value: 'xyz123abc456'
});

await verifyACMEChallenge('example.com', 'xyz123abc456');
```

### Pattern 3: Complete Domain Setup with SSL

```javascript
async function setupDomainWithSSL(domain, options = {}) {
  const { includeWildcard = false, webhookConfig } = options;
  
  // Step 1: Verify DNS
  const dnsCheck = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { hostname: domain, type: 'A' }
  });
  
  if (dnsCheck.data.count === 0) {
    throw new Error(`DNS A record not found for ${domain}`);
  }
  
  // Step 2: Issue certificate
  let certRequest = { domain };
  
  if (includeWildcard && webhookConfig) {
    certRequest = {
      domain,
      altNames: [`*.${domain}`],
      challengeType: 'dns',
      dnsProvider: {
        provider: 'webhook',
        credentials: webhookConfig
      }
    };
  }
  
  const cert = await axios.post(`${AGENT_URL}/agent/ssl/issue`, certRequest);
  
  // Step 3: Verify certificate is active
  const health = await axios.get(`${AGENT_URL}/agent/ssl/health`, {
    params: { domain }
  });
  
  const certInfo = health.data.items.find(c => c.domain === domain);
  
  return {
    success: true,
    domain,
    certificate: cert.data,
    health: certInfo,
    autoRenewEnabled: certInfo.autoRenewEnabled
  };
}

// Usage
await setupDomainWithSSL('example.com', {
  includeWildcard: true,
  webhookConfig: {
    WEBHOOK_PRESENT_URL: 'https://api.example.com/acme/dns/present',
    WEBHOOK_AUTH_HEADER: 'Bearer secret'
  }
});
```

### Pattern 4: Domain Health Monitoring

```javascript
async function monitorDomainHealth(domains) {
  const results = [];
  
  for (const domain of domains) {
    // Check DNS
    const dns = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
      params: { hostname: domain, type: 'A' }
    }).catch(() => ({ data: { count: 0 } }));
    
    // Check SSL
    const ssl = await axios.get(`${AGENT_URL}/agent/ssl/health`, {
      params: { domain }
    }).catch(() => ({ data: { items: [] } }));
    
    const cert = ssl.data.items.find(c => c.domain === domain);
    
    results.push({
      domain,
      dns: {
        configured: dns.data.count > 0,
        ips: dns.data.records.map(r => r.value)
      },
      ssl: {
        active: cert?.status === 'active',
        expiresIn: cert?.daysToExpiry,
        autoRenew: cert?.autoRenewEnabled
      }
    });
  }
  
  return results;
}

// Usage
const domains = ['example.com', 'app.example.com', 'www.example.com'];
const health = await monitorDomainHealth(domains);

health.forEach(h => {
  console.log(`${h.domain}:`);
  console.log(`  DNS: ${h.dns.configured ? '✓' : '✗'}`);
  console.log(`  SSL: ${h.ssl.active ? '✓' : '✗'} (expires in ${h.ssl.expiresIn} days)`);
});
```

### Pattern 5: Batch Domain Validation

```javascript
async function validateDomains(domains) {
  const results = [];
  
  for (const domain of domains) {
    try {
      // Check A record
      const a = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
        params: { hostname: domain, type: 'A' }
      });
      
      // Check nameservers
      const ns = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
        params: { hostname: domain, type: 'NS' }
      });
      
      // Check SSL status
      const ssl = await axios.get(`${AGENT_URL}/agent/ssl/health`, {
        params: { domain }
      });
      
      results.push({
        domain,
        status: 'ok',
        dns: {
          a_records: a.data.records.map(r => r.value),
          nameservers: ns.data.records.map(r => r.value)
        },
        ssl: ssl.data.items.find(c => c.domain === domain)
      });
    } catch (error) {
      results.push({
        domain,
        status: 'error',
        error: error.response?.data?.error || error.message
      });
    }
  }
  
  return results;
}
```

---

## API Endpoints Summary

### SSL Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agent/ssl/acme-account` | POST | Configure ACME account (one-time) |
| `/agent/ssl/issue` | POST | Issue certificate |
| `/agent/ssl/renew` | POST | Renew certificate (manual) |
| `/agent/ssl` | GET | List certificates |
| `/agent/ssl/health` | GET | Certificate health/expiry |
| `/agent/ssl/download` | GET | Download certificate bundle |
| `/agent/ssl/revoke` | DELETE | Revoke certificate |
| `/agent/ssl/auto-renewal/status` | GET | Auto-renewal status |
| `/agent/ssl/auto-renewal/trigger` | POST | Trigger renewal check |

### DNS Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agent/dns/lookup` | GET | DNS lookup (all record types) |

---

## Response Formats

### SSL Certificate Response

```json
{
  "domain": "example.com",
  "issuedAt": "2025-12-02T19:17:53Z",
  "expiresAt": "2026-03-02T19:17:52Z",
  "issuer": "R13",
  "status": "active",
  "webServer": "apache",
  "managedBy": "jetcamer",
  "autoRenewEnabled": true,
  "challengeType": "http",
  "sans": ["www.example.com"]
}
```

### DNS Lookup Response

```json
{
  "hostname": "example.com",
  "recordType": "A",
  "records": [
    {
      "type": "A",
      "value": "93.184.216.34"
    }
  ],
  "count": 1
}
```

### DNS Lookup Response (MX with Priority)

```json
{
  "hostname": "example.com",
  "recordType": "MX",
  "records": [
    {
      "type": "MX",
      "value": "mail.example.com.",
      "priority": 10
    },
    {
      "type": "MX",
      "value": "mail2.example.com.",
      "priority": 20
    }
  ],
  "count": 2
}
```

---

## Error Handling

### User-Friendly Error Format

All SSL errors return structured, actionable messages:

```json
{
  "success": false,
  "error": "DNS_NOT_CONFIGURED",
  "message": "DNS is not configured for www.example.com",
  "action": "Please add an A record for www.example.com pointing to your server's IP address, then try again.",
  "details": "The domain does not exist in DNS or the A record is missing.",
  "rawError": "[www.example.com] acme: error: 400 :: DNS problem: NXDOMAIN"
}
```

**Response Fields:**
- `success` - Always `false` for errors
- `error` - Error code (e.g., `DNS_NOT_CONFIGURED`)
- `message` - **Display this to users**
- `action` - **Tell users what to do**
- `details` - Technical information for debugging
- `rawError` - Original error (optional, for logs)

### Common Error Codes

| Error Code | User Message | Action |
|------------|--------------|--------|
| `DNS_NOT_CONFIGURED` | DNS is not configured for {domain} | Add A record pointing to server IP |
| `DNS_PROPAGATION_PENDING` | DNS records have not propagated yet | Wait 5-10 minutes for DNS propagation |
| `PORT_80_BLOCKED` | Port 80 is not accessible or blocked | Open port 80 or use DNS-01 challenge |
| `WEBHOOK_FAILED` | DNS webhook endpoint failed | Check webhook accessibility and auth token |
| `RATE_LIMIT_EXCEEDED` | Let's Encrypt rate limit exceeded | Wait 1 hour or use staging |
| `ACME_NOT_CONFIGURED` | SSL service is not configured | Contact administrator |
| `CERTIFICATE_NOT_FOUND` | No certificate found for domain | Issue new certificate instead |
| `INVALID_DOMAIN` | Invalid domain name format | Use valid domain format |

**See full list:** [SSL_ERROR_HANDLING_GUIDE.md](SSL_ERROR_HANDLING_GUIDE.md)

### Error Handling Pattern

```javascript
async function safeIssueCertificate(domain) {
  try {
    // Pre-flight DNS check
    const dns = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
      params: { hostname: domain, type: 'A' }
    });
    
    if (dns.data.count === 0) {
      return {
        success: false,
        error: 'DNS_NOT_CONFIGURED',
        message: `DNS A record not found for ${domain}`
      };
    }
    
    // Issue certificate
    const cert = await axios.post(`${AGENT_URL}/agent/ssl/issue`, {
      domain
    });
    
    return {
      success: true,
      data: cert.data
    };
    
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    
    // Handle specific errors
    if (errorMsg.includes('ACME account not configured')) {
      return {
        success: false,
        error: 'ACME_NOT_CONFIGURED',
        message: 'Please configure ACME account first'
      };
    }
    
    if (errorMsg.includes('rate limit')) {
      return {
        success: false,
        error: 'RATE_LIMIT',
        message: 'Let\'s Encrypt rate limit exceeded. Try staging or wait.'
      };
    }
    
    return {
      success: false,
      error: 'UNKNOWN',
      message: errorMsg
    };
  }
}
```

---

## Complete Example: SSL Manager Class

```javascript
const axios = require('axios');

class JetCamerAgentClient {
  constructor(agentIP) {
    this.agentUrl = `http://${agentIP}:9811`;
  }
  
  // DNS Lookup
  async lookupDNS(hostname, type = 'A') {
    const response = await axios.get(`${this.agentUrl}/agent/dns/lookup`, {
      params: { hostname, type }
    });
    return response.data;
  }
  
  // Verify domain resolves
  async verifyDNS(hostname) {
    const dns = await this.lookupDNS(hostname, 'A');
    return dns.count > 0;
  }
  
  // Issue standard certificate
  async issueCertificate(domain) {
    // Pre-flight check
    if (!(await this.verifyDNS(domain))) {
      throw new Error(`DNS not configured for ${domain}`);
    }
    
    const response = await axios.post(`${this.agentUrl}/agent/ssl/issue`, {
      domain
    });
    
    return response.data;
  }
  
  // Issue wildcard certificate
  async issueWildcardCertificate(domain, webhookConfig) {
    const response = await axios.post(`${this.agentUrl}/agent/ssl/issue`, {
      domain,
      altNames: [`*.${domain}`],
      challengeType: 'dns',
      dnsProvider: {
        provider: 'webhook',
        credentials: webhookConfig
      }
    });
    
    return response.data;
  }
  
  // Get certificate health
  async getCertificateHealth(domain) {
    const response = await axios.get(`${this.agentUrl}/agent/ssl/health`, {
      params: { domain }
    });
    
    return response.data.items.find(c => c.domain === domain);
  }
  
  // Download certificate
  async downloadCertificate(domain, format = 'json') {
    const response = await axios.get(`${this.agentUrl}/agent/ssl/download`, {
      params: { domain, format }
    });
    
    return response.data;
  }
  
  // Verify ACME challenge TXT record
  async verifyACMEChallenge(domain, expectedValue) {
    const challengeHost = `_acme-challenge.${domain}`;
    
    for (let i = 0; i < 10; i++) {
      const txt = await this.lookupDNS(challengeHost, 'TXT');
      const found = txt.records.some(r => r.value === expectedValue);
      
      if (found) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return false;
  }
}

// Usage
const agent = new JetCamerAgentClient('54.214.70.207');

// Issue certificate
await agent.issueCertificate('example.com');

// Issue wildcard
await agent.issueWildcardCertificate('example.com', {
  WEBHOOK_PRESENT_URL: 'https://api.example.com/acme/dns/present',
  WEBHOOK_AUTH_HEADER: 'Bearer secret'
});

// Check health
const health = await agent.getCertificateHealth('example.com');
console.log(`Expires in ${health.daysToExpiry} days`);
```

---

## Testing

### Test Agent Connection

```bash
curl http://{AGENT_IP}:9811/health
# Expected: "ok"
```

### Test DNS Lookup

```bash
curl "http://{AGENT_IP}:9811/agent/dns/lookup?hostname=google.com&type=A"
```

### Test SSL Issuance

```bash
curl -X POST http://{AGENT_IP}:9811/agent/ssl/issue \
  -H "Content-Type: application/json" \
  -d '{"domain":"test.example.com"}'
```

---

## Auto-Renewal

**Good News:** Auto-renewal is **automatic**! No code needed.

- Certificates auto-renew 30 days before expiry
- Works for HTTP-01, Route53, Cloudflare, and Webhook DNS
- Agent handles everything in the background

**Optional Monitoring:**

```javascript
// Check auto-renewal status
const status = await axios.get(`${AGENT_URL}/agent/ssl/auto-renewal/status`);

// Manually trigger renewal check
await axios.post(`${AGENT_URL}/agent/ssl/auto-renewal/trigger`);
```

---

## Best Practices

1. **Always verify DNS before SSL issuance**
   ```javascript
   const dns = await agent.lookupDNS(domain);
   if (dns.count === 0) {
     // Fix DNS first
   }
   ```

2. **Use DNS lookup for webhook verification**
   ```javascript
   // After webhook creates TXT record
   await verifyACMEChallenge(domain, challengeValue);
   ```

3. **Monitor certificate health regularly**
   ```javascript
   const health = await agent.getCertificateHealth(domain);
   if (health.daysToExpiry < 30) {
     // Alert or manual renewal
   }
   ```

4. **Handle errors gracefully**
   ```javascript
   try {
     await agent.issueCertificate(domain);
   } catch (error) {
     // Check error type and handle appropriately
   }
   ```

---

## Quick Reference

### Common Tasks

```javascript
// 1. Issue standard certificate
POST /agent/ssl/issue
{ "domain": "example.com" }

// 2. Issue wildcard certificate
POST /agent/ssl/issue
{
  "domain": "example.com",
  "altNames": ["*.example.com"],
  "challengeType": "dns",
  "dnsProvider": { "provider": "webhook", ... }
}

// 3. Check DNS
GET /agent/dns/lookup?hostname=example.com&type=A

// 4. Check certificate health
GET /agent/ssl/health?domain=example.com

// 5. Download certificate
GET /agent/ssl/download?domain=example.com&format=json
```

---

## Error Handling Best Practices

### Frontend Error Display

```javascript
async function issueCertificateWithUI(domain) {
  try {
    const response = await axios.post(`${AGENT_URL}/agent/ssl/issue`, {
      domain
    });
    
    // Show success
    showNotification({
      type: 'success',
      message: 'Certificate issued successfully!'
    });
    
    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    
    if (errorData && !errorData.success) {
      // Show user-friendly error
      showNotification({
        type: 'error',
        title: errorData.message,        // ← Display this
        message: errorData.action,       // ← Tell user what to do
      });
      
      // Log technical details for debugging
      console.error('SSL Error:', {
        code: errorData.error,
        details: errorData.details,
        raw: errorData.rawError
      });
    } else {
      // Fallback for unexpected errors
      showNotification({
        type: 'error',
        message: 'Failed to issue certificate. Please try again.'
      });
    }
  }
}
```

### Error Codes Reference

| Code | What It Means | Show User |
|------|---------------|-----------|
| `DNS_NOT_CONFIGURED` | Domain not in DNS | "Configure DNS first" |
| `PORT_80_BLOCKED` | Port 80 not accessible | "Use DNS-01 challenge" |
| `WEBHOOK_FAILED` | Webhook error | "Check webhook settings" |
| `RATE_LIMIT_EXCEEDED` | Too many certificates | "Wait 1 hour or use staging" |

**Complete Error Guide:** [SSL_ERROR_HANDLING_GUIDE.md](SSL_ERROR_HANDLING_GUIDE.md)

---

## Support & Documentation

### Main Guides
- **Integration Guide:** `WEB_TEAM_INTEGRATION_GUIDE.md` (this document)
- **SSL Reference:** `SSL_COMPLETE_INTEGRATION_GUIDE.md`
- **DNS API Reference:** `DNS_LOOKUP_API.md`
- **Error Handling:** `SSL_ERROR_HANDLING_GUIDE.md` ⭐ NEW

### Quick References
- **DNS Commands:** `DNS_API_QUICK_REFERENCE.md`
- **Auto-Renewal:** Built-in, no code needed!

### Documentation Index
- **Navigation:** `WEB_TEAM_DOCS_INDEX.md`

---

**Ready to integrate!** 🚀

