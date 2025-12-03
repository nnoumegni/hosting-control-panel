/**
 * Test WebSocket connection for analytics dashboard
 */

const WebSocket = require('ws');

const instanceId = 'i-0f5c110d53370ee3b';
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
// Convert https:// to wss:// and http:// to ws://
const wsBaseUrl = apiBaseUrl
  .replace(/^https:\/\//, 'wss://')
  .replace(/^http:\/\//, 'ws://')
  .replace(/\/api$/, '');
const wsUrl = `${wsBaseUrl}/analytics-ws?instanceId=${encodeURIComponent(instanceId)}`;

console.log('Testing WebSocket connection...');
console.log('URL:', wsUrl);
console.log('Instance ID:', instanceId);
console.log('');

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log('Sending subscribe message...');
  
  ws.send(JSON.stringify({
    type: 'subscribe',
    instanceId: instanceId,
  }));
  
  console.log('Waiting for analytics data...');
  console.log('');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:');
    console.log(JSON.stringify(message, null, 2));
    
    if (message.type === 'analytics') {
      console.log('');
      console.log('✅ Analytics data received!');
      console.log('Stats:', message.data?.stats);
      console.log('Total events:', message.data?.analyticsData?.length || 0);
    }
  } catch (error) {
    console.log('📨 Received raw message:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.error('Full error:', error);
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log('🔌 WebSocket closed');
  console.log('Code:', code);
  console.log('Reason:', reason.toString());
  process.exit(code === 1000 ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('');
    console.log('⏱️  Test completed (10 seconds)');
    ws.close();
  } else {
    console.log('');
    console.log('⏱️  Connection timeout');
    process.exit(1);
  }
}, 10000);

