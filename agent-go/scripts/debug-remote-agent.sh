#!/usr/bin/env bash
# Debug script to find where agent logs are going

REMOTE_HOST="${REMOTE_HOST:-ubuntu@44.248.12.249}"
SSH_KEY="${SSH_KEY:-/Users/nnoumegni/Downloads/jetcamer.pem}"

echo "=== Debugging JetCamer Agent Logs ==="
echo ""

# Check systemd journal
echo "1. Checking systemd journal (journalctl):"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo journalctl -u jetcamer-agent -n 50 --no-pager"
echo ""

# Check if log files exist
echo "2. Checking log file locations:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "ls -la /var/log/jetcamer-agent/ 2>/dev/null || echo 'Directory does not exist'"
echo ""

# Check error log
echo "3. Checking error log:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo tail -n 50 /var/log/jetcamer-agent/agent-error.log 2>/dev/null || echo 'Error log file not found or empty'"
echo ""

# Check if agent process is actually running
echo "4. Checking agent process:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "ps aux | grep jetcamer-agent | grep -v grep"
echo ""

# Test agent endpoint
echo "5. Testing agent health endpoint:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "curl -s http://127.0.0.1:9811/health || echo 'Agent not responding'"
echo ""

# Check systemd service configuration
echo "6. Checking systemd service configuration:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo cat /etc/systemd/system/jetcamer-agent.service"
echo ""

