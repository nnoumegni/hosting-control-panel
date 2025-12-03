#!/usr/bin/env bash
# Script to watch agent logs on remote server in real-time

REMOTE_HOST="${REMOTE_HOST:-ubuntu@44.248.12.249}"
SSH_KEY="${SSH_KEY:-/Users/nnoumegni/Downloads/jetcamer.pem}"

echo "Watching JetCamer Agent logs on: $REMOTE_HOST"
echo "Press Ctrl+C to stop"
echo ""

# Watch logs in real-time
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo tail -f /var/log/jetcamer-agent/agent.log"

