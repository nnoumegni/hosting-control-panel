#!/usr/bin/env bash
# Script to check agent logs on remote server

REMOTE_HOST="${REMOTE_HOST:-ubuntu@44.248.12.249}"
SSH_KEY="${SSH_KEY:-/Users/nnoumegni/Downloads/jetcamer.pem}"

echo "Checking JetCamer Agent logs on remote server: $REMOTE_HOST"
echo ""

# Check if service is running
echo "=== Service Status ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo systemctl status jetcamer-agent --no-pager -l" 2>/dev/null || echo "Service check failed"
echo ""

# Check recent logs
echo "=== Recent Logs (last 50 lines) ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo tail -n 50 /var/log/jetcamer-agent/agent.log 2>/dev/null || echo 'Log file not found'"
echo ""

# Check for S3-related messages
echo "=== S3 Upload Messages ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo grep -i 's3\|upload\|batch' /var/log/jetcamer-agent/agent.log 2>/dev/null | tail -20 || echo 'No S3 messages found'"
echo ""

# Check for errors
echo "=== Recent Errors ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo tail -n 20 /var/log/jetcamer-agent/agent-error.log 2>/dev/null || echo 'No error log file'"
echo ""

# Check if agent is listening
echo "=== Agent Health Check ==="
ssh -i "$SSH_KEY" "$REMOTE_HOST" "curl -s http://127.0.0.1:9811/health 2>/dev/null || echo 'Agent not responding on port 9811'"
echo ""

