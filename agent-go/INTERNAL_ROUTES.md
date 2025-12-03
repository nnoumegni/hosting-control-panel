# JetCamer Agent - Internal Routes Documentation

This document describes all internal routes available in the JetCamer Agent for S3 upload functionality and system management.

## Base URL

All routes are available on the agent's web server, typically running on:
- **Default**: `http://127.0.0.1:9811`
- **Configurable**: Set via `webListen` in `/etc/jetcamer/agent.config.json`

---

## Internal Routes

### 1. GET `/internal/get-machine-id`

Retrieves the machine ID from `/etc/machine-id`. This is used to organize S3 uploads by machine.

#### Request
```bash
curl http://127.0.0.1:9811/internal/get-machine-id
```

#### Response
**Success (200 OK):**
```json
{
  "machineId": "ec282171ca6fb64d95aac58ef0200377"
}
```

**Error (500 Internal Server Error):**
```json
{
  "error": "Cannot read machine-id from /etc/machine-id: ..."
}
```

#### Use Cases
- Retrieve machine ID for S3 bucket path construction
- Verify machine ID is accessible
- Use in external APIs to identify the machine

---

### 2. PUT `/internal/set-aws-config`

Sets AWS credentials to be used as **first priority** for S3 operations. These credentials take precedence over environment variables, credentials files, and IAM roles.

#### Request
```bash
curl -X PUT http://127.0.0.1:9811/internal/set-aws-config \
  -H "Content-Type: application/json" \
  -d '{
    "AWS_ACCESS_KEY_ID": "AKIA...",
    "AWS_SECRET_ACCESS_KEY": "your-secret-key",
    "AWS_REGION": "us-west-2"
  }'
```

#### Payload
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | string | Yes | AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | string | Yes | AWS secret access key |
| `AWS_REGION` | string | No | AWS region (e.g., `us-west-2`). If not provided, will attempt to detect from EC2 metadata |

#### Response
**Success (200 OK):**
```json
{
  "status": "ok",
  "message": "AWS credentials stored successfully",
  "region": "us-west-2"
}
```

**Success with warning (200 OK):**
```json
{
  "status": "ok",
  "message": "AWS credentials stored successfully",
  "warning": "AWS_REGION not provided, will attempt to detect from EC2 metadata"
}
```

**Error (400 Bad Request):**
```json
{
  "error": "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required"
}
```

#### Important Notes
- Credentials are stored **in memory** (thread-safe)
- Credentials take **first priority** over all other credential sources
- To use new credentials immediately, **restart the agent service** after setting them
- Credentials persist until the agent is restarted or new credentials are set
- To clear stored credentials, set empty values (will fall back to default credential chain)

---

### 3. GET `/internal/s3-validate`

Validates the S3 configuration without exposing sensitive data. Checks credentials, region, bucket access, and machine ID.

#### Request
```bash
curl http://127.0.0.1:9811/internal/s3-validate
```

#### Response
**Success (200 OK):**
```json
{
  "valid": true,
  "region": "us-west-2",
  "bucketExists": true,
  "machineId": "ec282171ca6fb64d95aac58ef0200377",
  "credentialsType": "stored-credentials"
}
```

**Invalid Configuration (503 Service Unavailable):**
```json
{
  "valid": false,
  "errors": [
    "AWS region is not configured. Set AWS_REGION environment variable or configure AWS credentials file"
  ],
  "region": "",
  "machineId": "ec282171ca6fb64d95aac58ef0200377",
  "credentialsType": "not-detected"
}
```

**With Warnings (200 OK):**
```json
{
  "valid": true,
  "warnings": [
    "Bucket cyber-agent-logs does not exist. It will be created automatically on first upload"
  ],
  "region": "us-west-2",
  "bucketExists": false,
  "machineId": "ec282171ca6fb64d95aac58ef0200377",
  "credentialsType": "ec2-instance-role"
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `valid` | boolean | Whether S3 configuration is valid and ready to use |
| `errors` | array[string] | List of configuration errors (if any) |
| `warnings` | array[string] | List of warnings (non-blocking issues) |
| `region` | string | Detected or configured AWS region |
| `bucketExists` | boolean | Whether the S3 bucket exists |
| `machineId` | string | Machine ID from `/etc/machine-id` |
| `credentialsType` | string | Type of credentials detected: `stored-credentials`, `environment-variables`, `credentials-file`, `ec2-instance-role`, `ecs-task-role`, `lambda-execution-role`, or `not-detected` |

#### Common Error Messages
- `"AWS region is not configured"` - Region not found in environment, config, or EC2 metadata
- `"AWS credentials not found or invalid"` - No valid credentials detected
- `"Access denied to bucket"` - IAM permissions insufficient
- `"Invalid AWS region"` - Region format is invalid

---

### 4. POST `/internal/batch`

Internal route used by the batch collector to upload events to S3 as NDJSON. This is called automatically by the batch sink, but can also be called manually for testing.

#### Request
```bash
curl -X POST http://127.0.0.1:9811/internal/batch \
  -H "Content-Type: application/json" \
  -d '{
    "env": "prod",
    "instanceId": "instance-123",
    "siteId": "site-456",
    "events": [
      {
        "ip": "192.168.1.100",
        "path": "/test",
        "method": "GET",
        "status": 200,
        "bytes": 1024,
        "ua": "Mozilla/5.0...",
        "referer": "",
        "ts": "2024-01-01T00:00:00Z",
        "source": "apache"
      }
    ]
  }'
```

#### Payload
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `env` | string | No | Environment identifier (e.g., `prod`, `staging`) |
| `instanceId` | string | No | Instance identifier |
| `siteId` | string | No | Site identifier |
| `events` | array[object] | Yes | Array of event objects to upload |

#### Event Object Structure
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ip` | string | Yes | Remote IP address |
| `path` | string | Yes | Request path |
| `method` | string | Yes | HTTP method (e.g., `GET`, `POST`) |
| `status` | integer | Yes | HTTP status code |
| `bytes` | integer | Yes | Response size in bytes |
| `ua` | string | No | User agent string |
| `referer` | string | No | Referer header |
| `ts` | string | Yes | Timestamp in ISO 8601 format |
| `source` | string | No | Log source identifier |

#### Response
**Success (200 OK):**
```json
{
  "status": "ok",
  "uploaded": 1
}
```

**No Events (200 OK):**
```json
{
  "status": "ok",
  "message": "no events to upload"
}
```

**Error (400 Bad Request):**
```json
{
  "error": "invalid JSON payload"
}
```

**Error (500 Internal Server Error):**
```json
{
  "error": "S3 uploader not initialized"
}
```

or

```json
{
  "error": "failed to upload to S3"
}
```

#### S3 Upload Details
- Events are uploaded as **NDJSON** (Newline Delimited JSON)
- Files are stored in S3 at: `s3://cyber-agent-logs/{machine-id}/{timestamp}-{nanoseconds}.ndjson`
- Each line in the file is a JSON object representing one event
- The bucket `cyber-agent-logs` is created automatically if it doesn't exist

---

## Public Routes (Reference)

For completeness, here are the public routes also available:

### GET `/health`
Health check endpoint. Returns `"ok"` if the agent is running.

### GET `/version`
Returns the agent version:
```json
{
  "version": "4.0.3"
}
```

### GET `/live`
Returns live analytics snapshot (last N events).

### GET `/live/summary`
Returns aggregated analytics summary.

### GET `/security`
Returns security engine snapshot.

---

## Usage Examples

### Complete Setup Flow

1. **Check if agent is running:**
   ```bash
   curl http://127.0.0.1:9811/health
   ```

2. **Get machine ID:**
   ```bash
   curl http://127.0.0.1:9811/internal/get-machine-id
   ```

3. **Set AWS credentials:**
   ```bash
   curl -X PUT http://127.0.0.1:9811/internal/set-aws-config \
     -H "Content-Type: application/json" \
     -d '{
       "AWS_ACCESS_KEY_ID": "AKIA...",
       "AWS_SECRET_ACCESS_KEY": "...",
       "AWS_REGION": "us-west-2"
     }'
   ```

4. **Validate S3 configuration:**
   ```bash
   curl http://127.0.0.1:9811/internal/s3-validate
   ```

5. **Test batch upload:**
   ```bash
   curl -X POST http://127.0.0.1:9811/internal/batch \
     -H "Content-Type: application/json" \
     -d '{
       "events": [{
         "ip": "1.2.3.4",
         "path": "/test",
         "method": "GET",
         "status": 200,
         "bytes": 100,
         "ua": "test",
         "ts": "2024-01-01T00:00:00Z",
         "source": "test"
       }]
     }'
   ```

### Troubleshooting

**Check agent version:**
```bash
curl http://127.0.0.1:9811/version
```

**Validate S3 setup:**
```bash
curl http://127.0.0.1:9811/internal/s3-validate | jq
```

**Check if credentials are stored:**
```bash
# If credentialsType is "stored-credentials", credentials were set via API
curl http://127.0.0.1:9811/internal/s3-validate | jq .credentialsType
```

---

## Security Notes

- All internal routes are accessible only on `127.0.0.1:9811` by default (not exposed to external network)
- Credentials stored via `/internal/set-aws-config` are kept in memory only (not persisted to disk)
- The validation endpoint does not expose sensitive data (access keys, secrets)
- Machine ID is safe to expose (it's a system identifier, not sensitive)

---

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200 OK` - Success
- `400 Bad Request` - Invalid request payload
- `405 Method Not Allowed` - Wrong HTTP method
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service not ready (for validation endpoint when invalid)

Error responses include a JSON object with an `error` field describing the issue.

