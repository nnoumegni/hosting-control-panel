#!/bin/bash
# Test script for SSM agent installation and data fetching

set -e

API_URL="${API_URL:-http://localhost:4000}"
INSTANCE_ID="${INSTANCE_ID:-}"

if [ -z "$INSTANCE_ID" ]; then
  echo "Error: INSTANCE_ID environment variable is required"
  echo "Usage: INSTANCE_ID=i-1234567890abcdef0 ./test-ssm-agent.sh"
  exit 1
fi

echo "Testing SSM Agent Service"
echo "API URL: $API_URL"
echo "Instance ID: $INSTANCE_ID"
echo ""

# Test 1: Check agent status
echo "1. Checking agent status..."
STATUS_RESPONSE=$(curl -s "${API_URL}/api/agent/ssm/status?instanceId=${INSTANCE_ID}")
echo "Response: $STATUS_RESPONSE"
echo ""

# Test 2: Install agent (if not installed)
IS_INSTALLED=$(echo "$STATUS_RESPONSE" | grep -o '"isInstalled":true' || echo "")
if [ -z "$IS_INSTALLED" ]; then
  echo "2. Installing agent..."
  INSTALL_RESPONSE=$(curl -s -X POST "${API_URL}/api/agent/ssm/install" \
    -H "Content-Type: application/json" \
    -d "{\"instanceId\":\"${INSTANCE_ID}\"}")
  echo "Response: $INSTALL_RESPONSE"
  
  COMMAND_ID=$(echo "$INSTALL_RESPONSE" | grep -o '"commandId":"[^"]*' | cut -d'"' -f4)
  if [ -n "$COMMAND_ID" ]; then
    echo "Command ID: $COMMAND_ID"
    echo "Waiting for installation to complete (this may take a few minutes)..."
    
    # Poll for status
    for i in {1..60}; do
      sleep 5
      CMD_STATUS=$(curl -s "${API_URL}/api/agent/ssm/command?commandId=${COMMAND_ID}&instanceId=${INSTANCE_ID}")
      STATUS=$(echo "$CMD_STATUS" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
      echo "  Attempt $i: Status = $STATUS"
      
      if [ "$STATUS" = "Success" ]; then
        echo "  ✓ Installation completed successfully!"
        break
      elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ]; then
        echo "  ✗ Installation failed or was cancelled"
        echo "  Full response: $CMD_STATUS"
        exit 1
      fi
    done
  fi
else
  echo "2. Agent is already installed, skipping installation"
fi
echo ""

# Test 3: Check status again
echo "3. Checking agent status after installation..."
STATUS_RESPONSE=$(curl -s "${API_URL}/api/agent/ssm/status?instanceId=${INSTANCE_ID}")
echo "Response: $STATUS_RESPONSE"
echo ""

# Test 4: Fetch agent data (if running)
IS_RUNNING=$(echo "$STATUS_RESPONSE" | grep -o '"isRunning":true' || echo "")
if [ -n "$IS_RUNNING" ]; then
  echo "4. Fetching agent data..."
  DATA_RESPONSE=$(curl -s "${API_URL}/api/agent/ssm/data?instanceId=${INSTANCE_ID}&endpoint=/live")
  echo "Response: $DATA_RESPONSE" | head -c 500
  echo "..."
  echo ""
else
  echo "4. Agent is not running, skipping data fetch"
  echo "   (The agent may still be starting up. Wait a moment and try again.)"
fi

echo ""
echo "Tests completed!"


