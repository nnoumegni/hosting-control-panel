/**
 * Test WebSocket connection without authentication
 * Dashboard endpoint doesn't require auth, so this should work
 */

const WebSocket = require('ws');

const instanceId = 'i-0f5c110d53370ee3b';
const wsUrl = `wss://localhost:4000/analytics-ws?instanceId=${encodeURIComponent(instanceId)}`;

console.log('Testing WebSocket connection WITHOUT authentication...');
console.log('URL:', wsUrl);
console.log('Note: Dashboard endpoint does not require HMAC authentication');
console.log('');

const ws = new WebSocket(wsUrl, {
  rejectUnauthorized: false, // Allow self-signed certs
});

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log('📤 Sending subscribe message (no auth required)...');
  
  ws.send(JSON.stringify({
    type: 'subscribe',
    instanceId: instanceId,
  }));
  
  console.log('✅ Subscribe message sent');
  console.log('Waiting for data...');
  console.log('');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:');
    console.log('   Type:', message.type);
    console.log('   Instance ID:', message.instanceId);
    if (message.data) {
      console.log('   Data keys:', Object.keys(message.data));
    }
    console.log('');
  } catch (error) {
    console.log('📨 Received raw message:', data.toString().substring(0, 200));
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  if (error.code === 'ECONNREFUSED') {
    console.error('');
    console.error('⚠️  Server is not running!');
    console.error('   Start the API server with: yarn dev:api');
  } else if (error.message.includes('400')) {
    console.error('');
    console.error('⚠️  Server rejected the upgrade (400 error)');
    console.error('   This might be a WebSocket server configuration issue');
  }
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log('🔌 Connection closed');
  console.log('   Code:', code);
  console.log('   Reason:', reason.toString());
  
  if (code === 1006) {
    console.log('');
    console.log('⚠️  Code 1006 = Abnormal closure');
    console.log('   Connection was lost without a close frame');
  }
  
  process.exit(code === 1000 ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('');
    console.log('⏱️  Test completed (10 seconds)');
    ws.close(1000, 'Test complete');
  } else if (ws.readyState === WebSocket.CONNECTING) {
    console.log('');
    console.log('⏱️  Connection timeout - still connecting');
    process.exit(1);
  }
}, 10000);

