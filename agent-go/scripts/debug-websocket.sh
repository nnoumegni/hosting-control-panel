#!/usr/bin/env bash
set -euo pipefail

echo "=== WebSocket Debugging Tool ==="
echo ""

AGENT_URL="${AGENT_URL:-http://127.0.0.1:9811}"

echo "1. Checking WebSocket Status..."
echo "   Endpoint: $AGENT_URL/internal/ws-status"
echo ""

STATUS=$(curl -s "$AGENT_URL/internal/ws-status" || echo '{"error":"connection failed"}')
echo "$STATUS" | jq '.' 2>/dev/null || echo "$STATUS"
echo ""

# Check if WebSocket is started
if echo "$STATUS" | grep -q '"started":true'; then
    echo "   ✓ WebSocket client is running"
else
    echo "   ❌ WebSocket client is NOT running"
    
    # Check why
    if echo "$STATUS" | grep -q '"canStart":false'; then
        MISSING=$(echo "$STATUS" | jq -r '.missing // "unknown"' 2>/dev/null || echo "unknown")
        echo "   Reason: Missing $MISSING"
        
        if [ "$MISSING" = "secret" ]; then
            echo ""
            echo "   To fix: Set AWS credentials via:"
            echo "   curl -X PUT $AGENT_URL/internal/set-aws-config \\"
            echo "     -H 'Content-Type: application/json' \\"
            echo "     -d '{\"AWS_ACCESS_KEY_ID\":\"...\",\"AWS_SECRET_ACCESS_KEY\":\"...\",\"AWS_REGION\":\"...\"}'"
        elif [ "$MISSING" = "apiURL" ]; then
            echo ""
            echo "   To fix: Ensure EC2 metadata service is accessible or set wsApiUrl in config"
        fi
    fi
fi

echo ""
echo "2. Checking AWS Credentials..."
CREDS_STATUS=$(curl -s "$AGENT_URL/internal/s3-validate" || echo '{}')
HAS_CREDS=$(echo "$CREDS_STATUS" | jq -r '.credentialsType // "unknown"' 2>/dev/null || echo "unknown")
echo "   Credentials type: $HAS_CREDS"

if echo "$CREDS_STATUS" | grep -q '"valid":true'; then
    echo "   ✓ AWS credentials are valid"
else
    echo "   ⚠️  AWS credentials may be invalid or missing"
fi

echo ""
echo "3. Checking Public IP Detection..."
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")
if [ -n "$PUBLIC_IP" ]; then
    echo "   ✓ Public IP detected: $PUBLIC_IP"
    echo "   Expected WebSocket URL: wss://$PUBLIC_IP/agent"
else
    echo "   ❌ Could not detect public IP from EC2 metadata"
    echo "   (This is normal if not running on EC2)"
fi

echo ""
echo "4. Recent WebSocket Logs..."
echo "   (Check agent logs for [ws] prefix)"
echo ""
echo "   To view logs:"
echo "   sudo journalctl -u jetcamer-agent -f | grep '\\[ws\\]'"
echo ""
echo "   Or check all recent logs:"
echo "   sudo journalctl -u jetcamer-agent --no-pager -n 50 | grep '\\[ws\\]'"
echo ""

echo "5. Testing WebSocket Connection (if server is available)..."
echo "   This requires a WebSocket server running on the expected URL"
echo "   Use a WebSocket client tool like 'websocat' or 'wscat' to test:"
echo ""
if [ -n "$PUBLIC_IP" ]; then
    echo "   websocat wss://$PUBLIC_IP/agent"
    echo "   or"
    echo "   wscat -c wss://$PUBLIC_IP/agent"
else
    echo "   (Public IP not available - cannot construct test URL)"
fi

echo ""
echo "=== Debug Complete ==="

