#!/bin/bash

# Debug WebSocket connection for instance i-0f5c110d53370ee3b
INSTANCE_ID="i-0f5c110d53370ee3b"
INSTANCE_IP="44.248.12.249"

echo "=== WebSocket Connection Debug ==="
echo "Instance ID: $INSTANCE_ID"
echo "Instance IP: $INSTANCE_IP"
echo ""

# Check if API server is running
echo "1. Checking if API server is running..."
if lsof -i :4000 | grep -q LISTEN; then
    echo "✅ API server is running on port 4000"
    API_RUNNING=true
else
    echo "❌ API server is NOT running on port 4000"
    API_RUNNING=false
fi
echo ""

# Test HTTP endpoint
if [ "$API_RUNNING" = true ]; then
    echo "2. Testing HTTP health endpoint..."
    HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health)
    if [ "$HTTP_RESPONSE" = "200" ]; then
        echo "✅ HTTP endpoint is responding"
    else
        echo "❌ HTTP endpoint returned status: $HTTP_RESPONSE"
    fi
    echo ""
fi

# Test WebSocket connection to dashboard endpoint
echo "3. Testing Dashboard WebSocket endpoint (/analytics-ws)..."
if [ "$API_RUNNING" = true ]; then
    node -e "
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://localhost:4000/analytics-ws?instanceId=$INSTANCE_ID');
    
    ws.on('open', () => {
        console.log('✅ Dashboard WebSocket connected!');
        ws.send(JSON.stringify({ type: 'subscribe', instanceId: '$INSTANCE_ID' }));
        setTimeout(() => ws.close(), 2000);
    });
    
    ws.on('message', (data) => {
        console.log('📨 Received:', data.toString().substring(0, 100));
    });
    
    ws.on('error', (error) => {
        console.log('❌ Error:', error.message);
        process.exit(1);
    });
    
    ws.on('close', () => {
        console.log('🔌 Connection closed');
        process.exit(0);
    });
    
    setTimeout(() => {
        console.log('⏱️  Timeout');
        process.exit(1);
    }, 5000);
    " 2>&1
else
    echo "⚠️  Skipping WebSocket test - API server not running"
fi
echo ""

# Test Agent WebSocket endpoint (if API is on instance)
echo "4. Testing Agent WebSocket endpoint (wss://$INSTANCE_IP/agent)..."
echo "   (This would be used by the agent running on the instance)"
node -e "
const WebSocket = require('ws');
const crypto = require('crypto');

// For testing, we'll try to connect (will likely fail without proper auth)
const ws = new WebSocket('wss://$INSTANCE_IP/agent');

ws.on('open', () => {
    console.log('✅ Agent WebSocket connected!');
    // Would send auth message here
    setTimeout(() => ws.close(), 2000);
});

ws.on('error', (error) => {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.log('❌ Cannot connect to $INSTANCE_IP:4000');
        console.log('   This is expected if the API is not running on the instance');
    } else {
        console.log('❌ Error:', error.message);
    }
    process.exit(0);
});

ws.on('close', () => {
    console.log('🔌 Connection closed');
    process.exit(0);
});

setTimeout(() => {
    console.log('⏱️  Timeout');
    process.exit(0);
}, 5000);
" 2>&1
echo ""

# Check connected agents
if [ "$API_RUNNING" = true ]; then
    echo "5. Checking connected WebSocket agents..."
    curl -s http://localhost:4000/api/websocket/agents | jq . 2>/dev/null || curl -s http://localhost:4000/api/websocket/agents
    echo ""
fi

echo "=== Debug Complete ==="

