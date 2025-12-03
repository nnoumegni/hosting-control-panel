#!/usr/bin/env bash
# Check if the new version with S3 upload is running

REMOTE_HOST="${REMOTE_HOST:-ubuntu@44.248.12.249}"
SSH_KEY="${SSH_KEY:-/Users/nnoumegni/Downloads/jetcamer.pem}"

echo "Checking if new agent version is running..."
echo ""

# Get the most recent agent logs
echo "=== Recent Agent Logs ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo journalctl -u jetcamer-agent --since '5 minutes ago' --no-pager" | grep -v "systemd\[1\]" | tail -30
echo ""

# Check for key indicators
echo "=== Checking for S3 Upload Features ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" << 'CHECK'
    echo "1. S3 uploader initialization:"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "s3 uploader\|S3 uploader" | tail -3 || echo "   ❌ Not found"
    
    echo ""
    echo "2. Batch sink status:"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "batch sink" | tail -3 || echo "   ❌ Not found"
    
    echo ""
    echo "3. Internal route:"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "internal route\|internal/batch" | tail -3 || echo "   ❌ Not found"
    
    echo ""
    echo "4. Errors:"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "error\|failed\|warning" | tail -5 || echo "   ✓ No errors found"
CHECK

echo ""
echo "=== Service Status ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo systemctl status jetcamer-agent --no-pager -l | head -15"
echo ""

echo "=== Testing Agent Endpoint ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "curl -s http://127.0.0.1:9811/health || echo 'Agent not responding'"
echo ""

