/**
 * Simple WebSocket connection test without authentication
 * Tests if the WebSocket upgrade works at all
 */

const WebSocket = require('ws');

const testUrl = process.argv[2] || 'wss://localhost:4000/analytics-ws?instanceId=test';

console.log('Testing WebSocket connection...');
console.log('URL:', testUrl);
console.log('');

const ws = new WebSocket(testUrl, {
  rejectUnauthorized: false, // Allow self-signed certs
});

let connected = false;

ws.on('open', () => {
  console.log('✅ WebSocket connection opened successfully!');
  connected = true;
  
  // Send a simple message
  ws.send(JSON.stringify({
    type: 'subscribe',
    instanceId: 'test-instance',
  }));
  
  console.log('📤 Sent subscribe message');
  console.log('Waiting 3 seconds...');
  
  setTimeout(() => {
    console.log('Closing connection...');
    ws.close(1000, 'Test complete');
  }, 3000);
});

ws.on('message', (data) => {
  console.log('📨 Received message:', data.toString().substring(0, 200));
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  if (error.code) {
    console.error('   Error code:', error.code);
  }
  if (error.code === 'ECONNREFUSED') {
    console.error('   → Server is not running or not accessible');
  } else if (error.message.includes('400')) {
    console.error('   → Server rejected the upgrade request');
  } else if (error.message.includes('certificate')) {
    console.error('   → Certificate validation error');
  }
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log('🔌 Connection closed');
  console.log('   Code:', code);
  console.log('   Reason:', reason.toString());
  
  if (connected) {
    console.log('');
    console.log('✅ Test completed - connection was successful!');
    process.exit(0);
  } else {
    console.log('');
    console.log('❌ Test failed - connection was never established');
    process.exit(1);
  }
});

setTimeout(() => {
  if (!connected) {
    console.log('');
    console.log('⏱️  Connection timeout (5 seconds)');
    process.exit(1);
  }
}, 5000);

