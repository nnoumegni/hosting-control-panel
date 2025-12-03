#!/usr/bin/env bash
# Test script to verify S3 upload functionality

set -e

AGENT_URL="${AGENT_URL:-http://127.0.0.1:9811}"
MACHINE_ID=$(cat /etc/machine-id 2>/dev/null || echo "test-$(hostname)")

echo "=== Testing S3 Upload Functionality ==="
echo "Agent URL: $AGENT_URL"
echo "Machine ID: $MACHINE_ID"
echo ""

# Test 1: Health check
echo "[1] Checking agent health..."
if curl -s -f "$AGENT_URL/health" > /dev/null; then
    echo "✓ Agent is running"
else
    echo "✗ Agent is not responding at $AGENT_URL"
    exit 1
fi

# Test 2: Get machine ID
echo "[2] Getting machine ID..."
MACHINE_ID_RESPONSE=$(curl -s "$AGENT_URL/internal/get-machine-id")
MACHINE_ID_FROM_API=$(echo "$MACHINE_ID_RESPONSE" | grep -o '"machineId":"[^"]*"' | cut -d'"' -f4)
if [ -n "$MACHINE_ID_FROM_API" ]; then
    echo "✓ Machine ID: $MACHINE_ID_FROM_API"
    MACHINE_ID="$MACHINE_ID_FROM_API"
else
    echo "✗ Failed to get machine ID: $MACHINE_ID_RESPONSE"
    exit 1
fi

# Test 3: Validate S3 config
echo "[3] Validating S3 configuration..."
VALIDATION=$(curl -s "$AGENT_URL/internal/s3-validate")
VALID=$(echo "$VALIDATION" | grep -o '"valid":[^,}]*' | cut -d':' -f2)
if [ "$VALID" = "true" ]; then
    echo "✓ S3 configuration is valid"
    echo "$VALIDATION" | grep -E '"region"|"bucketExists"|"credentialsType"' || true
else
    echo "✗ S3 configuration is invalid:"
    echo "$VALIDATION" | grep -o '"errors":\[[^]]*\]' || echo "$VALIDATION"
    exit 1
fi

# Test 4: Send test batch
echo ""
echo "[4] Sending test batch to /internal/batch..."
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RESPONSE=$(curl -s -X POST "$AGENT_URL/internal/batch" \
  -H "Content-Type: application/json" \
  -d "{
    \"env\": \"test\",
    \"instanceId\": \"test-instance\",
    \"siteId\": \"test-site\",
    \"events\": [
      {
        \"ip\": \"192.168.1.100\",
        \"path\": \"/test-path\",
        \"method\": \"GET\",
        \"status\": 200,
        \"bytes\": 1024,
        \"ua\": \"test-user-agent\",
        \"referer\": \"\",
        \"ts\": \"$TIMESTAMP\",
        \"source\": \"test-script\"
      },
      {
        \"ip\": \"192.168.1.101\",
        \"path\": \"/test-path-2\",
        \"method\": \"POST\",
        \"status\": 201,
        \"bytes\": 2048,
        \"ua\": \"test-user-agent-2\",
        \"referer\": \"https://example.com\",
        \"ts\": \"$TIMESTAMP\",
        \"source\": \"test-script\"
      }
    ]
  }")

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q '"status":"ok"'; then
    UPLOADED=$(echo "$RESPONSE" | grep -o '"uploaded":[0-9]*' | cut -d':' -f2)
    echo "✓ Batch uploaded successfully ($UPLOADED events)"
else
    echo "✗ Upload failed: $RESPONSE"
    exit 1
fi

# Test 5: Check S3 (if AWS CLI is available)
if command -v aws &> /dev/null; then
    echo ""
    echo "[5] Checking S3 bucket..."
    BUCKET="cyber-agent-logs"
    
    if aws s3 ls "s3://$BUCKET/" &> /dev/null; then
        echo "✓ Bucket exists"
        
        # List recent files for this machine-id
        echo "Recent uploads for machine-id $MACHINE_ID:"
        FILES=$(aws s3 ls "s3://$BUCKET/$MACHINE_ID/" --recursive 2>/dev/null | tail -5)
        if [ -n "$FILES" ]; then
            echo "$FILES"
            echo ""
            echo "Latest file details:"
            LATEST_FILE=$(aws s3 ls "s3://$BUCKET/$MACHINE_ID/" --recursive 2>/dev/null | tail -1 | awk '{print $4}')
            if [ -n "$LATEST_FILE" ]; then
                echo "  File: s3://$BUCKET/$LATEST_FILE"
                echo "  Content (first 3 lines):"
                aws s3 cp "s3://$BUCKET/$LATEST_FILE" - 2>/dev/null | head -3 || echo "    (could not read file)"
            fi
        else
            echo "  ⚠️  No files found for this machine-id yet"
            echo "  (Files may take a few seconds to appear, or check if uploads are actually happening)"
        fi
    else
        echo "⚠️  Bucket does not exist or AWS credentials not configured for AWS CLI"
    fi
else
    echo "[5] Skipping S3 check (AWS CLI not found)"
fi

echo ""
echo "=== Test Complete ==="
echo ""
echo "To verify uploads are working:"
echo "1. Check agent logs: sudo journalctl -u jetcamer-agent | grep -i 'uploaded batch to S3'"
echo "2. Check S3 bucket: aws s3 ls s3://cyber-agent-logs/$MACHINE_ID/ --recursive"
echo "3. Monitor in real-time: watch -n 2 'aws s3 ls s3://cyber-agent-logs/$MACHINE_ID/ --recursive | tail -5'"
