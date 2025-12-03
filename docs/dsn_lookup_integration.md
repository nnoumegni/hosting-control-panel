# DNS Lookup API - Web Team Integration

## Overview

The agent provides a **DNS lookup endpoint** that allows the web team to perform DNS resolution through the agent's optimized resolver stack.

**Benefits:**
- ✅ Uses local Unbound cache (50x faster for repeated lookups)
- ✅ Priority-based fallback (127.0.0.1 → 8.8.8.8 → 1.1.1.1 → 9.9.9.9)
- ✅ No rate limiting issues
- ✅ Simple REST API
- ✅ Works even if Unbound is down (automatic fallback)

---

## API Reference

### Endpoint

**GET** `/agent/dns/lookup`

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `hostname` | string | Yes | - | Domain name or hostname to resolve |
| `type` | string | No | `A` | Record type: `A`, `AAAA`, `CNAME`, `MX`, `NS`, `TXT`, `SOA`, `SRV`, `PTR`, `ANY` |

### Supported Record Types

| Type | Description | Example Use Case |
|------|-------------|------------------|
| **A** | IPv4 address | Standard domain resolution |
| **AAAA** | IPv6 address | IPv6 connectivity check |
| **CNAME** | Canonical name | Subdomain alias verification |
| **MX** | Mail exchange | Email server configuration |
| **NS** | Nameserver | Nameserver delegation check |
| **TXT** | Text records | SPF, DKIM, ACME challenges, domain verification |
| **SOA** | Start of authority | Zone information |
| **SRV** | Service records | Service discovery |
| **PTR** | Reverse DNS | IP to hostname |
| **ANY** | All records | Complete DNS overview |

### Request Examples

```bash
# A records (IPv4) - Default
curl "http://{AGENT_IP}:9811/agent/dns/lookup?hostname=example.com"

# AAAA records (IPv6)
curl "http://{AGENT_IP}:9811/agent/dns/lookup?hostname=example.com&type=AAAA"

# TXT records (ACME challenges, SPF, DKIM)
curl "http://{AGENT_IP}:9811/agent/dns/lookup?hostname=_acme-challenge.example.com&type=TXT"

# MX records (mail servers)
curl "http://{AGENT_IP}:9811/agent/dns/lookup?hostname=example.com&type=MX"

# NS records (nameservers)
curl "http://{AGENT_IP}:9811/agent/dns/lookup?hostname=example.com&type=NS"

# CNAME records (aliases)
curl "http://{AGENT_IP}:9811/agent/dns/lookup?hostname=www.example.com&type=CNAME"
```

### Success Response

**A/AAAA Records:**
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

**TXT Records:**
```json
{
  "hostname": "_acme-challenge.example.com",
  "recordType": "TXT",
  "records": [
    {
      "type": "TXT",
      "value": "xYz123AbC456DeF789..."
    }
  ],
  "count": 1
}
```

**MX Records:**
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

**NS Records:**
```json
{
  "hostname": "example.com",
  "recordType": "NS",
  "records": [
    {
      "type": "NS",
      "value": "ns1.example.com."
    },
    {
      "type": "NS",
      "value": "ns2.example.com."
    }
  ],
  "count": 2
}
```

**CNAME Records:**
```json
{
  "hostname": "www.example.com",
  "recordType": "CNAME",
  "records": [
    {
      "type": "CNAME",
      "value": "example.com."
    }
  ],
  "count": 1
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `hostname` | string | The hostname that was queried |
| `recordType` | string | The DNS record type queried |
| `records` | array | Array of DNS records |
| `records[].type` | string | Record type |
| `records[].value` | string | Record value |
| `records[].priority` | number | Priority (MX, SRV records only) |
| `records[].ttl` | number | Time to live (optional) |
| `count` | number | Number of records returned |
| `cachedFrom` | string | Which resolver was used (optional) |

### Error Response

```json
{
  "error": "lookup nonexistent.example.com: no such host",
  "hostname": "nonexistent.example.com",
  "type": "A"
}
```

**HTTP Status Codes:**

| Code | Meaning |
|------|---------|
| 200 | Success - records found |
| 400 | Bad request - invalid parameters or resolution failed |
| 405 | Method not allowed - use GET only |

---

## Use Cases

### 1. Pre-Flight DNS Check Before SSL Issuance

```javascript
// Before issuing SSL certificate, verify DNS is properly configured
async function checkDNSBeforeSSL(domain) {
  const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { 
      hostname: domain,
      type: 'A'
    }
  });
  
  const { records } = response.data;
  
  if (records.length === 0) {
    throw new Error(`DNS not configured for ${domain}`);
  }
  
  const ips = records.map(r => r.value);
  console.log(`✓ ${domain} resolves to: ${ips.join(', ')}`);
  return ips;
}

// Usage
await checkDNSBeforeSSL('example.com');
await issueCertificate('example.com');
```

### 1b. Verify ACME DNS-01 Challenge TXT Record

```javascript
// Verify TXT record exists for DNS-01 challenge
async function verifyACMEChallenge(domain, expectedValue) {
  const hostname = `_acme-challenge.${domain}`;
  
  const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { 
      hostname,
      type: 'TXT'
    }
  });
  
  const txtRecords = response.data.records.map(r => r.value);
  
  if (txtRecords.includes(expectedValue)) {
    console.log(`✓ ACME challenge TXT record verified for ${domain}`);
    return true;
  } else {
    console.log(`✗ Expected TXT record not found`);
    console.log(`  Got: ${txtRecords.join(', ')}`);
    console.log(`  Expected: ${expectedValue}`);
    return false;
  }
}

// Usage
await verifyACMEChallenge('example.com', 'xYz123AbC456...');
```

### 2. Verify Domain Propagation

```javascript
// Check if DNS changes have propagated
async function verifyDNSPropagation(domain, expectedIP) {
  const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { 
      hostname: domain,
      type: 'A'
    }
  });
  
  const ips = response.data.records.map(r => r.value);
  
  if (ips.includes(expectedIP)) {
    console.log(`✓ ${domain} correctly points to ${expectedIP}`);
    return true;
  } else {
    console.log(`✗ ${domain} points to ${ips.join(', ')}, expected ${expectedIP}`);
    return false;
  }
}

// Usage
await verifyDNSPropagation('app.example.com', '54.214.70.207');
```

### 2b. Check Nameserver Delegation

```javascript
// Verify nameservers are correctly configured
async function checkNameservers(domain, expectedNS) {
  const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { 
      hostname: domain,
      type: 'NS'
    }
  });
  
  const nameservers = response.data.records.map(r => r.value);
  
  console.log(`Nameservers for ${domain}:`, nameservers);
  
  // Check if expected nameservers are present
  const hasExpected = expectedNS.every(ns => 
    nameservers.some(actual => actual.includes(ns))
  );
  
  return {
    domain,
    nameservers,
    hasExpected,
    expectedNS
  };
}

// Usage
await checkNameservers('example.com', ['ns1.jetcamer.com', 'ns2.jetcamer.com']);
```

### 3. Verify Email Configuration (MX Records)

```javascript
// Check if email is properly configured for a domain
async function checkEmailConfig(domain) {
  const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { 
      hostname: domain,
      type: 'MX'
    }
  });
  
  const mailServers = response.data.records
    .sort((a, b) => a.priority - b.priority)
    .map(r => `${r.priority} ${r.value}`);
  
  console.log(`Mail servers for ${domain}:`);
  mailServers.forEach(ms => console.log(`  ${ms}`));
  
  return {
    domain,
    configured: response.data.count > 0,
    mailServers: response.data.records
  };
}

// Usage
await checkEmailConfig('example.com');
```

### 4. Verify SPF/DKIM Records (TXT)

```javascript
// Check SPF and DKIM TXT records
async function checkEmailSecurity(domain) {
  // Check SPF
  const spfResponse = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { 
      hostname: domain,
      type: 'TXT'
    }
  });
  
  const spfRecord = spfResponse.data.records.find(r => 
    r.value.startsWith('v=spf1')
  );
  
  // Check DKIM (example selector: 'default')
  const dkimResponse = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
    params: { 
      hostname: `default._domainkey.${domain}`,
      type: 'TXT'
    }
  }).catch(() => null);
  
  const dkimRecord = dkimResponse?.data.records.find(r => 
    r.value.includes('v=DKIM1')
  );
  
  return {
    domain,
    spf: {
      configured: !!spfRecord,
      record: spfRecord?.value
    },
    dkim: {
      configured: !!dkimRecord,
      record: dkimRecord?.value
    }
  };
}

// Usage
const security = await checkEmailSecurity('example.com');
console.log('SPF configured:', security.spf.configured);
console.log('DKIM configured:', security.dkim.configured);
```

### 5. Batch Domain Validation

```javascript
// Validate multiple domains before deployment
async function validateDomains(domains, recordType = 'A') {
  const results = [];
  
  for (const domain of domains) {
    try {
      const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
        params: { 
          hostname: domain,
          type: recordType
        }
      });
      
      results.push({
        domain,
        status: 'ok',
        records: response.data.records
      });
    } catch (error) {
      results.push({
        domain,
        status: 'failed',
        error: error.response?.data?.error || error.message
      });
    }
  }
  
  return results;
}

// Usage
const domains = ['example.com', 'www.example.com', 'app.example.com'];
const results = await validateDomains(domains);

results.forEach(r => {
  if (r.status === 'ok') {
    const values = r.records.map(rec => rec.value).join(', ');
    console.log(`✓ ${r.domain}: ${values}`);
  } else {
    console.error(`✗ ${r.domain}: ${r.error}`);
  }
});
```

### 6. Comprehensive DNS Diagnostics

```javascript
// Complete DNS overview for a domain
async function getDNSDiagnostics(domain) {
  const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'];
  const diagnostics = {
    domain,
    records: {},
    timestamp: new Date().toISOString()
  };
  
  for (const type of recordTypes) {
    try {
      const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
        params: { hostname: domain, type }
      });
      
      if (response.data.count > 0) {
        diagnostics.records[type] = response.data.records;
      }
    } catch (error) {
      // Skip if record type not found
    }
  }
  
  return diagnostics;
}

// Usage
const diag = await getDNSDiagnostics('example.com');
console.log(JSON.stringify(diag, null, 2));

// Output:
// {
//   "domain": "example.com",
//   "records": {
//     "A": [{"type": "A", "value": "93.184.216.34"}],
//     "MX": [{"type": "MX", "value": "mail.example.com.", "priority": 10}],
//     "NS": [{"type": "NS", "value": "ns1.example.com."}],
//     "TXT": [{"type": "TXT", "value": "v=spf1 ..."}]
//   },
//   "timestamp": "2025-12-02T20:30:00.000Z"
// }
```

### 7. DNS Troubleshooting Dashboard

```javascript
// Create a comprehensive DNS diagnostics endpoint
app.get('/api/dns/diagnose/:domain', async (req, res) => {
  const { domain } = req.params;
  
  try {
    const diagnostics = await getDNSDiagnostics(domain);
    
    res.json({
      success: true,
      domain,
      ...diagnostics,
      summary: {
        hasA: !!diagnostics.records.A,
        hasAAAA: !!diagnostics.records.AAAA,
        hasMX: !!diagnostics.records.MX,
        hasNS: !!diagnostics.records.NS,
        hasTXT: !!diagnostics.records.TXT
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      domain,
      error: error.message
    });
  }
});
```

### 8. Domain Health Monitoring

```javascript
// Monitor domain DNS health with multiple record types
async function monitorDomainHealth(domains) {
  const health = {};
  
  for (const domain of domains) {
    try {
      const start = Date.now();
      
      // Check A records
      const aResponse = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
        params: { hostname: domain, type: 'A' }
      });
      
      // Check MX records (optional)
      const mxResponse = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
        params: { hostname: domain, type: 'MX' }
      }).catch(() => null);
      
      const duration = Date.now() - start;
      
      health[domain] = {
        status: 'healthy',
        a_records: aResponse.data.records.map(r => r.value),
        mx_records: mxResponse?.data.records.map(r => r.value) || [],
        responseTime: duration
      };
    } catch (error) {
      health[domain] = {
        status: 'unhealthy',
        error: error.response?.data?.error || error.message
      };
    }
  }
  
  return health;
}

// Run every 5 minutes
setInterval(async () => {
  const domains = await getDomains();
  const health = await monitorDomainHealth(domains);
  
  // Store in database or send alerts for unhealthy domains
  console.log('Domain Health:', health);
}, 5 * 60 * 1000);
```

---

## Performance

### Response Times

| Scenario | Time |
|----------|------|
| **First lookup** (cache miss) | 50-200 ms |
| **Cached lookup** (via Unbound) | 1-5 ms |
| **Fallback** (Unbound down) | 50-200 ms |

### Caching Behavior

```javascript
// First request (cold cache)
await axios.get(`${AGENT_URL}/agent/dns/lookup?hostname=example.com`);
// Time: ~100ms (goes to upstream DNS)

// Second request (warm cache - same domain)
await axios.get(`${AGENT_URL}/agent/dns/lookup?hostname=example.com`);
// Time: ~2ms (from Unbound cache) - 50x faster!

// Cache duration: 60 seconds to 24 hours (based on TTL)
```

---

## Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');
const AGENT_URL = 'http://54.214.70.207:9811';

async function lookupDomain(hostname) {
  try {
    const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
      params: { hostname }
    });
    
    console.log(`${hostname} → ${response.data.ips.join(', ')}`);
    return response.data.ips;
  } catch (error) {
    console.error(`Failed to resolve ${hostname}:`, error.response?.data?.error);
    throw error;
  }
}

// Usage
await lookupDomain('google.com');
await lookupDomain('app.phncag.org');
```

### Python

```python
import requests

AGENT_URL = 'http://54.214.70.207:9811'

def lookup_domain(hostname):
    try:
        response = requests.get(
            f'{AGENT_URL}/agent/dns/lookup',
            params={'hostname': hostname}
        )
        response.raise_for_status()
        
        data = response.json()
        print(f"{hostname} → {', '.join(data['ips'])}")
        return data['ips']
    except requests.exceptions.HTTPError as e:
        error_msg = e.response.json().get('error', str(e))
        print(f"Failed to resolve {hostname}: {error_msg}")
        raise

# Usage
lookup_domain('google.com')
lookup_domain('app.phncag.org')
```

### Bash/cURL

```bash
#!/bin/bash

AGENT_URL="http://54.214.70.207:9811"

# A records (IPv4)
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=example.com&type=A" | jq .

# AAAA records (IPv6)
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=example.com&type=AAAA" | jq .

# TXT records (SPF, DKIM, ACME challenges)
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=example.com&type=TXT" | jq .
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=_acme-challenge.example.com&type=TXT" | jq .

# MX records (mail servers)
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=example.com&type=MX" | jq .

# NS records (nameservers)
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=example.com&type=NS" | jq .

# CNAME records (aliases)
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=www.example.com&type=CNAME" | jq .

# Extract values only
curl -s "${AGENT_URL}/agent/dns/lookup?hostname=example.com&type=A" | jq -r '.records[].value'

# Check if domain resolves (exit code)
if curl -sf "${AGENT_URL}/agent/dns/lookup?hostname=example.com" >/dev/null; then
  echo "✓ Domain resolves"
else
  echo "✗ Domain does not resolve"
fi

# Complete DNS overview
for type in A AAAA MX NS TXT; do
  echo "=== $type Records for example.com ==="
  curl -s "${AGENT_URL}/agent/dns/lookup?hostname=example.com&type=$type" | jq '.records'
  echo ""
done
```

---

## Error Handling

### Common Errors

**1. Hostname Missing**
```json
{
  "error": "hostname parameter is required"
}
```
**Fix**: Add `?hostname=example.com` to URL

**2. Domain Not Found**
```json
{
  "error": "lookup nonexistent.example.com: no such host",
  "hostname": "nonexistent.example.com"
}
```
**Meaning**: Domain doesn't exist or DNS isn't configured

**3. DNS Timeout**
```json
{
  "error": "lookup example.com: i/o timeout",
  "hostname": "example.com"
}
```
**Meaning**: All DNS resolvers timed out (rare)

### Error Handling Pattern

```javascript
async function safeLookup(hostname) {
  try {
    const response = await axios.get(`${AGENT_URL}/agent/dns/lookup`, {
      params: { hostname },
      timeout: 5000  // 5 second timeout
    });
    
    return {
      success: true,
      ips: response.data.ips
    };
  } catch (error) {
    if (error.response?.status === 400) {
      // DNS resolution failed (domain doesn't exist)
      return {
        success: false,
        error: error.response.data.error,
        reason: 'dns_not_configured'
      };
    }
    
    // Network or other error
    return {
      success: false,
      error: error.message,
      reason: 'network_error'
    };
  }
}

// Usage
const result = await safeLookup('example.com');
if (result.success) {
  console.log('IPs:', result.ips);
} else {
  console.error('Error:', result.error);
}
```

---

## Complete Record Type Examples

### A Records (IPv4 Addresses)

```bash
curl "http://localhost:9811/agent/dns/lookup?hostname=google.com&type=A" | jq .
```

**Response:**
```json
{
  "hostname": "google.com",
  "recordType": "A",
  "records": [{"type": "A", "value": "142.250.80.46"}],
  "count": 1
}
```

### TXT Records (SPF, DKIM, ACME, Verification)

```bash
# SPF records
curl "http://localhost:9811/agent/dns/lookup?hostname=google.com&type=TXT" | jq .

# ACME challenge verification
curl "http://localhost:9811/agent/dns/lookup?hostname=_acme-challenge.example.com&type=TXT" | jq .

# Domain verification (Google, Microsoft, etc.)
curl "http://localhost:9811/agent/dns/lookup?hostname=example.com&type=TXT" | jq '.records[] | select(.value | startswith("google-site-verification"))'
```

**Response:**
```json
{
  "hostname": "google.com",
  "recordType": "TXT",
  "records": [
    {"type": "TXT", "value": "v=spf1 include:_spf.google.com ~all"},
    {"type": "TXT", "value": "google-site-verification=..."}
  ],
  "count": 2
}
```

### MX Records (Mail Servers)

```bash
curl "http://localhost:9811/agent/dns/lookup?hostname=google.com&type=MX" | jq .
```

**Response:**
```json
{
  "hostname": "google.com",
  "recordType": "MX",
  "records": [
    {"type": "MX", "value": "smtp.google.com.", "priority": 10}
  ],
  "count": 1
}
```

### NS Records (Nameservers)

```bash
curl "http://localhost:9811/agent/dns/lookup?hostname=google.com&type=NS" | jq .
```

**Response:**
```json
{
  "hostname": "google.com",
  "recordType": "NS",
  "records": [
    {"type": "NS", "value": "ns1.google.com."},
    {"type": "NS", "value": "ns2.google.com."}
  ],
  "count": 2
}
```

### CNAME Records (Aliases)

```bash
curl "http://localhost:9811/agent/dns/lookup?hostname=www.github.com&type=CNAME" | jq .
```

**Response:**
```json
{
  "hostname": "www.github.com",
  "recordType": "CNAME",
  "records": [
    {"type": "CNAME", "value": "github.com."}
  ],
  "count": 1
}
```

### AAAA Records (IPv6)

```bash
curl "http://localhost:9811/agent/dns/lookup?hostname=google.com&type=AAAA" | jq .
```

**Response:**
```json
{
  "hostname": "google.com",
  "recordType": "AAAA",
  "records": [
    {"type": "AAAA", "value": "2607:f8b0:4004:c07::71"}
  ],
  "count": 1
}
```

---

## Testing

### Test Basic Lookup

```bash
# Default (A records)
curl "http://localhost:9811/agent/dns/lookup?hostname=google.com"
```

### Test All Record Types

```bash
for type in A AAAA CNAME MX NS TXT; do
  echo "=== $type Records ==="
  curl -s "http://localhost:9811/agent/dns/lookup?hostname=google.com&type=$type" | jq .
  echo ""
done
```

### Test Invalid Domain

```bash
curl "http://localhost:9811/agent/dns/lookup?hostname=thisdoesnotexist12345.com&type=A"
```

### Test Missing Parameter

```bash
curl "http://localhost:9811/agent/dns/lookup"
```

### Test Invalid Record Type

```bash
curl "http://localhost:9811/agent/dns/lookup?hostname=google.com&type=INVALID"
```

### Test ACME Challenge Verification

```bash
# Verify TXT record for DNS-01 challenge
DOMAIN="example.com"
CHALLENGE="_acme-challenge.${DOMAIN}"

curl "http://localhost:9811/agent/dns/lookup?hostname=${CHALLENGE}&type=TXT" | jq .
```

---

## Rate Limiting

**None!** The endpoint has no rate limiting because:

1. DNS lookups are fast (1-5ms for cached)
2. Unbound handles thousands of queries per second
3. Automatic fallback prevents abuse
4. Local caching prevents upstream rate limits

---

## Security

1. **No authentication required** - DNS is public information
2. **Read-only operation** - Cannot modify DNS records
3. **No data persistence** - Results not stored
4. **Local network only** - Endpoint typically accessed via private IP

If you need to restrict access:
- Use firewall rules to limit port 9811
- Use reverse proxy with authentication
- Use VPN/private network access

---

## Integration Example

### Domain Verification Service

```javascript
class DomainService {
  constructor(agentURL) {
    this.agentURL = agentURL;
  }
  
  async verifyDomain(domain, expectedIP) {
    try {
      const response = await axios.get(`${this.agentURL}/agent/dns/lookup`, {
        params: { hostname: domain }
      });
      
      const { ips } = response.data;
      
      return {
        domain,
        configured: true,
        ips,
        matchesExpected: expectedIP ? ips.includes(expectedIP) : null
      };
    } catch (error) {
      return {
        domain,
        configured: false,
        error: error.response?.data?.error || error.message
      };
    }
  }
  
  async verifyDomains(domains, expectedIP) {
    const results = await Promise.all(
      domains.map(domain => this.verifyDomain(domain, expectedIP))
    );
    
    return {
      total: results.length,
      configured: results.filter(r => r.configured).length,
      unconfigured: results.filter(r => !r.configured).length,
      results
    };
  }
}

// Usage
const domainService = new DomainService('http://54.214.70.207:9811');

// Verify single domain
const result = await domainService.verifyDomain('app.example.com', '54.214.70.207');
console.log(result);

// Verify multiple domains
const domains = ['example.com', 'www.example.com', 'app.example.com'];
const report = await domainService.verifyDomains(domains, '54.214.70.207');
console.log(`${report.configured}/${report.total} domains configured correctly`);
```

---

## Troubleshooting

### Problem: "hostname parameter is required"

**Cause**: Missing `hostname` query parameter

**Fix:**
```bash
# ❌ Wrong
curl "http://localhost:9811/agent/dns/lookup"

# ✅ Correct
curl "http://localhost:9811/agent/dns/lookup?hostname=example.com"
```

### Problem: "no such host"

**Cause**: Domain doesn't exist or DNS not configured

**Check DNS:**
```bash
# Test with dig
dig example.com

# Test with nslookup
nslookup example.com
```

### Problem: Slow responses (> 1 second)

**Possible causes:**
1. Unbound not running (check: `systemctl status unbound`)
2. First lookup (cache miss - normal)
3. Network issues with upstream DNS

**Check Unbound:**
```bash
curl http://localhost:9811/gateway/requirements | \
  jq '.report.results[] | select(.key=="dns.unbound")'
```

---

## FAQ

**Q: How fast is the DNS lookup?**  
A: 1-5ms for cached lookups, 50-200ms for cache misses.

**Q: Is there a rate limit?**  
A: No rate limiting on the endpoint.

**Q: What if Unbound is down?**  
A: Automatic fallback to Google DNS (8.8.8.8) and Cloudflare (1.1.1.1).

**Q: What record types are supported?**  
A: A, AAAA, CNAME, MX, NS, TXT, SOA, SRV, PTR, ANY - all standard DNS record types!

**Q: Can I lookup IPv6 addresses?**  
A: Yes, use `type=AAAA` parameter.

**Q: Does it support reverse DNS (PTR)?**  
A: Yes! Use `type=PTR` with an IP address.

**Q: Can I verify ACME DNS-01 challenges?**  
A: Yes! Use `type=TXT` with `_acme-challenge.yourdomain.com`

**Q: Can I check SPF/DKIM records?**  
A: Yes! Use `type=TXT` to see SPF, DKIM, and other TXT records.

**Q: Can I specify which DNS server to use?**  
A: No. The agent uses its priority-based resolver stack automatically (127.0.0.1 → 8.8.8.8 → 1.1.1.1 → 9.9.9.9).

**Q: Is the result cached?**  
A: Yes, by Unbound (60 seconds to 24 hours based on TTL).

**Q: Can I clear the DNS cache?**  
A: Restart Unbound: `systemctl restart unbound`

---

## Summary

The DNS lookup API provides:

✅ **Simple REST interface** - Single GET request  
✅ **All DNS record types** - A, AAAA, CNAME, MX, NS, TXT, SOA, SRV, PTR, ANY  
✅ **Fast cached lookups** - Via Unbound (1-5ms for cached records)  
✅ **Automatic fallback** - Priority-based resolver chain  
✅ **No rate limiting** - Local Unbound cache prevents upstream limits  
✅ **Structured responses** - Clean JSON with record type, value, priority  
✅ **ACME challenge verification** - Check TXT records for DNS-01  
✅ **Email validation** - Check MX, SPF, DKIM records  
✅ **Nameserver verification** - Check NS delegation  
✅ **Easy integration** - Works with any language/framework  

**Perfect for:**
- Domain verification before SSL issuance
- ACME DNS-01 challenge validation
- Email configuration checks (MX, SPF, DKIM)
- Nameserver delegation verification
- DNS debugging and troubleshooting
- Pre-flight deployment checks

🚀 **Complete DNS tooling for the web team!**

