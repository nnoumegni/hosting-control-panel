#!/usr/bin/env bash
# Comprehensive script to check if S3 uploads are working

set -e

AGENT_URL="${AGENT_URL:-http://127.0.0.1:9811}"

echo "=== Checking S3 Upload Status ==="
echo ""

# 1. Check agent is running
echo "[1] Agent Status:"
if curl -s -f "$AGENT_URL/health" > /dev/null; then
    echo "  ✓ Agent is running"
else
    echo "  ✗ Agent is not responding"
    exit 1
fi

# 2. Get machine ID
echo ""
echo "[2] Machine ID:"
MACHINE_ID=$(curl -s "$AGENT_URL/internal/get-machine-id" | grep -o '"machineId":"[^"]*"' | cut -d'"' -f4)
if [ -n "$MACHINE_ID" ]; then
    echo "  ✓ Machine ID: $MACHINE_ID"
else
    echo "  ✗ Failed to get machine ID"
    exit 1
fi

# 3. Check S3 validation
echo ""
echo "[3] S3 Configuration:"
VALIDATION=$(curl -s "$AGENT_URL/internal/s3-validate")
VALID=$(echo "$VALIDATION" | grep -o '"valid":[^,}]*' | cut -d':' -f2)
BUCKET_EXISTS=$(echo "$VALIDATION" | grep -o '"bucketExists":[^,}]*' | cut -d':' -f2)
REGION=$(echo "$VALIDATION" | grep -o '"region":"[^"]*"' | cut -d'"' -f4)

if [ "$VALID" = "true" ]; then
    echo "  ✓ S3 configuration is valid"
    echo "  ✓ Region: $REGION"
    if [ "$BUCKET_EXISTS" = "true" ]; then
        echo "  ✓ Bucket exists"
    else
        echo "  ⚠️  Bucket does not exist (will be created on first upload)"
    fi
else
    echo "  ✗ S3 configuration is invalid"
    echo "$VALIDATION" | grep -o '"errors":\[[^]]*\]' || echo "$VALIDATION"
    exit 1
fi

# 4. Check agent logs for upload activity
echo ""
echo "[4] Recent Upload Activity (from logs):"
echo "  Checking for 'uploaded batch to S3' messages..."
if command -v journalctl &> /dev/null; then
    UPLOAD_LOGS=$(sudo journalctl -u jetcamer-agent --no-pager -n 100 2>/dev/null | grep -i "uploaded batch to S3" | tail -5)
    if [ -n "$UPLOAD_LOGS" ]; then
        echo "$UPLOAD_LOGS" | while read -r line; do
            echo "  ✓ $line"
        done
    else
        echo "  ⚠️  No upload messages found in recent logs"
        echo "  (This could mean: no events collected yet, or uploads haven't happened)"
    fi
    
    echo ""
    echo "  Checking for batch sink activity..."
    BATCH_LOGS=$(sudo journalctl -u jetcamer-agent --no-pager -n 100 2>/dev/null | grep -i "batch sink" | tail -5)
    if [ -n "$BATCH_LOGS" ]; then
        echo "$BATCH_LOGS" | while read -r line; do
            echo "  → $line"
        done
    else
        echo "  ⚠️  No batch sink activity found"
    fi
else
    echo "  (journalctl not available, skipping log check)"
fi

# 5. Check S3 bucket contents
echo ""
echo "[5] S3 Bucket Contents:"
if command -v aws &> /dev/null; then
    BUCKET="cyber-agent-logs"
    echo "  Checking s3://$BUCKET/$MACHINE_ID/"
    
    FILES=$(aws s3 ls "s3://$BUCKET/$MACHINE_ID/" --recursive 2>/dev/null | wc -l)
    if [ "$FILES" -gt 0 ]; then
        echo "  ✓ Found $FILES file(s) in S3"
        echo ""
        echo "  Recent files:"
        aws s3 ls "s3://$BUCKET/$MACHINE_ID/" --recursive 2>/dev/null | tail -5 | while read -r line; do
            SIZE=$(echo "$line" | awk '{print $3}')
            FILE=$(echo "$line" | awk '{print $4}')
            SIZE_MB=$(echo "scale=2; $SIZE/1024/1024" | bc 2>/dev/null || echo "$SIZE bytes")
            echo "    - $FILE ($SIZE_MB)"
        done
        
        echo ""
        echo "  Latest file content preview:"
        LATEST_FILE=$(aws s3 ls "s3://$BUCKET/$MACHINE_ID/" --recursive 2>/dev/null | tail -1 | awk '{print $4}')
        if [ -n "$LATEST_FILE" ]; then
            echo "    File: s3://$BUCKET/$LATEST_FILE"
            echo "    First 3 lines:"
            aws s3 cp "s3://$BUCKET/$LATEST_FILE" - 2>/dev/null | head -3 | sed 's/^/      /' || echo "      (could not read)"
        fi
    else
        echo "  ⚠️  No files found in S3 bucket"
        echo "  This could mean:"
        echo "    - No events have been collected yet"
        echo "    - Batch sink hasn't flushed yet (runs every 10s by default)"
        echo "    - Uploads are failing silently"
    fi
else
    echo "  (AWS CLI not available, install with: sudo apt install awscli)"
fi

# 6. Test manual upload
echo ""
echo "[6] Testing Manual Upload:"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TEST_RESPONSE=$(curl -s -X POST "$AGENT_URL/internal/batch" \
  -H "Content-Type: application/json" \
  -d "{
    \"events\": [{
      \"ip\": \"192.168.1.100\",
      \"path\": \"/test\",
      \"method\": \"GET\",
      \"status\": 200,
      \"bytes\": 100,
      \"ua\": \"test\",
      \"ts\": \"$TIMESTAMP\",
      \"source\": \"manual-test\"
    }]
  }")

if echo "$TEST_RESPONSE" | grep -q '"status":"ok"'; then
    echo "  ✓ Manual upload test successful"
    echo "  Response: $TEST_RESPONSE"
    
    # Wait a moment and check if file appeared
    if command -v aws &> /dev/null; then
        echo ""
        echo "  Waiting 2 seconds and checking S3..."
        sleep 2
        NEW_FILES=$(aws s3 ls "s3://cyber-agent-logs/$MACHINE_ID/" --recursive 2>/dev/null | tail -1)
        if [ -n "$NEW_FILES" ]; then
            echo "  ✓ File appeared in S3:"
            echo "    $NEW_FILES"
        else
            echo "  ⚠️  File not yet visible in S3 (may take a few more seconds)"
        fi
    fi
else
    echo "  ✗ Manual upload test failed: $TEST_RESPONSE"
fi

echo ""
echo "=== Summary ==="
echo ""
echo "To verify uploads are working:"
echo "1. Check logs: sudo journalctl -u jetcamer-agent -f | grep -i 'upload\|batch'"
echo "2. Check S3: aws s3 ls s3://cyber-agent-logs/$MACHINE_ID/ --recursive"
echo "3. Monitor bucket: watch -n 5 'aws s3 ls s3://cyber-agent-logs/$MACHINE_ID/ --recursive | wc -l'"
echo ""
echo "If bucket is empty, check:"
echo "- Are log files being tailed? (check logs for 'logtail: starting tail')"
echo "- Are events being collected? (check /live endpoint)"
echo "- Is batch sink running? (check logs for 'batch sink using internal route')"
echo "- Are uploads succeeding? (check logs for 'uploaded batch to S3')"

