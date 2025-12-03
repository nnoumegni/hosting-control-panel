#!/bin/bash

# Debug WebSocket connections for instance i-0f5c110d53370ee3b

INSTANCE_ID="i-0f5c110d53370ee3b"
INSTANCE_IP="44.248.12.249"
API_PORT=4000
WEB_PORT=5010

echo "=== WebSocket Connection Debug ==="
echo "Instance ID: $INSTANCE_ID"
echo "Instance IP: $INSTANCE_IP"
echo ""

# 1. Check if API server is running
echo "1. Checking API server status..."
if lsof -i :$API_PORT | grep -q LISTEN; then
    echo "✅ API server is running on port $API_PORT"
    API_RUNNING=true
else
    echo "❌ API server is NOT running on port $API_PORT"
    API_RUNNING=false
fi
echo ""

# 2. Check if Web server is running
echo "2. Checking Web server status..."
if lsof -i :$WEB_PORT | grep -q LISTEN; then
    echo "✅ Web server is running on port $WEB_PORT"
    WEB_RUNNING=true
else
    echo "❌ Web server is NOT running on port $WEB_PORT"
    WEB_RUNNING=false
fi
echo ""

# 3. Check SSL certificates
echo "3. Checking SSL certificates..."
if [ -f "apps/api/certs/cert.pem" ] && [ -f "apps/api/certs/key.pem" ]; then
    echo "✅ SSL certificates found"
    CERT_EXISTS=true
else
    echo "❌ SSL certificates NOT found"
    CERT_EXISTS=false
fi
echo ""

# 4. Test HTTP/HTTPS endpoint
if [ "$API_RUNNING" = true ]; then
    echo "4. Testing API HTTP/HTTPS endpoint..."
    HTTP_RESPONSE=$(curl -s -k -o /dev/null -w "%{http_code}" https://localhost:$API_PORT/api/health 2>/dev/null)
    if [ "$HTTP_RESPONSE" = "200" ]; then
        echo "✅ HTTPS endpoint responding (status: $HTTP_RESPONSE)"
    else
        HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$API_PORT/api/health 2>/dev/null)
        if [ "$HTTP_RESPONSE" = "200" ]; then
            echo "⚠️  HTTP endpoint responding (status: $HTTP_RESPONSE) - HTTPS may not be configured"
        else
            echo "❌ API endpoint not responding (status: $HTTP_RESPONSE)"
        fi
    fi
    echo ""
fi

# 5. Test Agent WebSocket endpoint
echo "5. Testing Agent WebSocket endpoint (wss://$INSTANCE_IP/agent)..."
if [ "$API_RUNNING" = true ]; then
    node -e "
    const WebSocket = require('ws');
    const crypto = require('crypto');
    
    // For testing, we'll try to connect (will likely fail without proper auth)
    const ws = new WebSocket('wss://$INSTANCE_IP/agent', {
        rejectUnauthorized: false // Allow self-signed certs for testing
    });
    
    let connected = false;
    let errorReceived = false;
    
    ws.on('open', () => {
        console.log('✅ Agent WebSocket connection opened!');
        connected = true;
        // Would send auth message here
        setTimeout(() => ws.close(), 2000);
    });
    
    ws.on('error', (error) => {
        if (!errorReceived) {
            errorReceived = true;
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                console.log('❌ Cannot connect to $INSTANCE_IP:$API_PORT');
                console.log('   This means the API is not accessible at the instance IP');
                console.log('   The agent should connect to the API server running on the instance');
            } else if (error.code === 'CERT_HAS_EXPIRED' || error.message.includes('certificate')) {
                console.log('⚠️  Certificate error:', error.message);
            } else {
                console.log('❌ Connection error:', error.message);
            }
        }
    });
    
    ws.on('close', (code, reason) => {
        if (connected) {
            console.log('🔌 Connection closed (code: ' + code + ')');
        }
        process.exit(0);
    });
    
    setTimeout(() => {
        if (!connected && !errorReceived) {
            console.log('⏱️  Connection timeout');
            process.exit(1);
        }
    }, 5000);
    " 2>&1
else
    echo "⚠️  Skipping - API server not running"
fi
echo ""

# 6. Test Dashboard WebSocket endpoint
echo "6. Testing Dashboard WebSocket endpoint (wss://localhost:$API_PORT/analytics-ws)..."
if [ "$API_RUNNING" = true ]; then
    node -e "
    const WebSocket = require('ws');
    
    const wsUrl = 'wss://localhost:$API_PORT/analytics-ws?instanceId=$INSTANCE_ID';
    const ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false // Allow self-signed certs for testing
    });
    
    let connected = false;
    
    ws.on('open', () => {
        console.log('✅ Dashboard WebSocket connected!');
        connected = true;
        
        // Send subscribe message
        ws.send(JSON.stringify({
            type: 'subscribe',
            instanceId: '$INSTANCE_ID',
        }));
        
        console.log('📤 Sent subscribe message');
        setTimeout(() => ws.close(), 3000);
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('📨 Received message:', JSON.stringify(message, null, 2).substring(0, 200));
        } catch (error) {
            console.log('📨 Received raw message:', data.toString().substring(0, 100));
        }
    });
    
    ws.on('error', (error) => {
        console.log('❌ WebSocket error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('   Connection refused - check if WebSocket server is running');
        }
    });
    
    ws.on('close', (code, reason) => {
        if (connected) {
            console.log('🔌 Connection closed (code: ' + code + ', reason: ' + reason.toString() + ')');
        }
        process.exit(0);
    });
    
    setTimeout(() => {
        if (!connected) {
            console.log('⏱️  Connection timeout');
            process.exit(1);
        }
    }, 5000);
    " 2>&1
else
    echo "⚠️  Skipping - API server not running"
fi
echo ""

# 7. Check connected agents via API
if [ "$API_RUNNING" = true ]; then
    echo "7. Checking connected WebSocket agents..."
    curl -s -k https://localhost:$API_PORT/api/websocket/agents 2>/dev/null | jq . 2>/dev/null || \
    curl -s http://localhost:$API_PORT/api/websocket/agents 2>/dev/null | jq . 2>/dev/null || \
    echo "Could not fetch connected agents"
    echo ""
fi

# 8. Check environment variables
echo "8. Checking environment configuration..."
if [ -f "apps/api/.env" ]; then
    if grep -q "SSL_CERT_PATH" apps/api/.env; then
        echo "✅ SSL_CERT_PATH configured"
        grep "SSL_CERT_PATH" apps/api/.env | head -1
    else
        echo "❌ SSL_CERT_PATH not configured"
    fi
    
    if grep -q "SSL_KEY_PATH" apps/api/.env; then
        echo "✅ SSL_KEY_PATH configured"
        grep "SSL_KEY_PATH" apps/api/.env | head -1
    else
        echo "❌ SSL_KEY_PATH not configured"
    fi
else
    echo "❌ apps/api/.env file not found"
fi
echo ""

# 9. Summary
echo "=== Summary ==="
if [ "$API_RUNNING" = true ] && [ "$CERT_EXISTS" = true ]; then
    echo "✅ API server is running with SSL certificates"
    echo ""
    echo "Expected connections:"
    echo "  - Agent: wss://$INSTANCE_IP/agent"
    echo "  - Dashboard: wss://localhost:$API_PORT/analytics-ws?instanceId=$INSTANCE_ID"
else
    echo "⚠️  Issues detected:"
    [ "$API_RUNNING" = false ] && echo "  - API server not running"
    [ "$CERT_EXISTS" = false ] && echo "  - SSL certificates missing"
fi
echo ""

