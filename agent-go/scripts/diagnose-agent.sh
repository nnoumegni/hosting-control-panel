#!/usr/bin/env bash
# Comprehensive diagnosis of agent status
#
# ONE-LINER VERSION (run directly on remote server):
#   echo "=== Agent Diagnosis ===" && echo "" && echo "1. Recent logs:" && sudo journalctl -u jetcamer-agent --no-pager -n 50 && echo "" && echo "2. Errors/Warnings:" && sudo journalctl -u jetcamer-agent --no-pager | grep -iE 'error|warning|failed|fatal' | tail -20 && echo "" && echo "3. Binary info:" && PID=$(pgrep jetcamer-agent | head -1) && if [ -n "$PID" ]; then echo "   PID: $PID" && echo "   Path: $(readlink -f /proc/$PID/exe 2>/dev/null || ps -p $PID -o cmd= | awk '{print $1}')" && echo "   Size: $(stat -c%s /opt/jetcamer-agent/jetcamer-agent 2>/dev/null || echo 'unknown')" && echo "   Modified: $(stat -c%y /opt/jetcamer-agent/jetcamer-agent 2>/dev/null || echo 'unknown')"; else echo "   ❌ Process not found"; fi && echo "" && echo "4. Health:" && curl -s http://127.0.0.1:9811/health 2>&1 || echo 'Not responding' && echo "" && echo "5. Service:" && sudo systemctl status jetcamer-agent --no-pager -l | head -20 && echo "" && echo "6. Patterns:" && echo "   - Starting:" && sudo journalctl -u jetcamer-agent --no-pager | grep -i "jetcamer agent starting" | tail -1 || echo "      Not found" && echo "   - S3:" && sudo journalctl -u jetcamer-agent --no-pager | grep -i "s3" | tail -3 || echo "      Not found" && echo "   - Batch sink:" && sudo journalctl -u jetcamer-agent --no-pager | grep -i "batch sink" | tail -3 || echo "      Not found" && echo "   - Web server:" && sudo journalctl -u jetcamer-agent --no-pager | grep -i "web server listening" | tail -1 || echo "      Not found" && echo "" && echo "=== Complete ==="

REMOTE_HOST="${REMOTE_HOST:-ubuntu@44.248.12.249}"
SSH_KEY="${SSH_KEY:-/Users/nnoumegni/Downloads/jetcamer.pem}"

echo "=== Comprehensive Agent Diagnosis ==="
echo ""

# 1. Check all recent logs (no filtering)
echo "1. ALL recent agent logs (last 50 lines):"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo journalctl -u jetcamer-agent --no-pager -n 50"
echo ""

# 2. Check for any errors or warnings
echo "2. Errors and Warnings:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo journalctl -u jetcamer-agent --no-pager | grep -iE 'error|warning|failed|fatal' | tail -20"
echo ""

# 3. Check what binary is actually running
echo "3. Running binary info:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" << 'BINARY_CHECK'
    PID=$(pgrep jetcamer-agent | head -1)
    if [ -n "$PID" ]; then
        echo "   Process PID: $PID"
        echo "   Binary path: $(sudo readlink -f /proc/$PID/exe 2>/dev/null || ps -p $PID -o cmd= | awk '{print $1}')"
        echo "   Binary size: $(stat -c%s /opt/jetcamer-agent/jetcamer-agent 2>/dev/null || echo 'unknown')"
        echo "   Binary modified: $(stat -c%y /opt/jetcamer-agent/jetcamer-agent 2>/dev/null || echo 'unknown')"
    else
        echo "   ❌ Agent process not found"
    fi
BINARY_CHECK
echo ""

# 4. Check if agent is responding
echo "4. Agent health check:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "curl -s http://127.0.0.1:9811/health 2>&1 || echo 'Not responding'"
echo ""

# 5. Check service status
echo "5. Service status:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo systemctl status jetcamer-agent --no-pager -l | head -20"
echo ""

# 6. Check for specific log patterns
echo "6. Looking for specific patterns:"
ssh -i "$SSH_KEY" "$REMOTE_HOST" << 'PATTERNS'
    echo "   - 'JetCamer agent starting':"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "jetcamer agent starting" | tail -1 || echo "      Not found"
    
    echo "   - 'S3':"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "s3" | tail -3 || echo "      Not found"
    
    echo "   - 'batch sink':"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "batch sink" | tail -3 || echo "      Not found"
    
    echo "   - 'web server listening':"
    sudo journalctl -u jetcamer-agent --no-pager | grep -i "web server listening" | tail -1 || echo "      Not found"
PATTERNS
echo ""

echo "=== Diagnosis Complete ==="

