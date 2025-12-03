/**
 * Test WebSocket connection without authentication
 * This tests the basic WebSocket upgrade and connection
 */

const WebSocket = require('ws');

console.log('Testing WebSocket connection WITHOUT authentication...');
console.log('');

// Test 1: Dashboard WebSocket (should work without auth)
console.log('=== Test 1: Dashboard WebSocket (/analytics-ws) ===');
const dashboardWs = new WebSocket('wss://localhost:4000/analytics-ws?instanceId=test-instance', {
  rejectUnauthorized: false,
});

dashboardWs.on('open', () => {
  console.log('✅ Dashboard WebSocket connected!');
  console.log('Sending subscribe message...');
  
  dashboardWs.send(JSON.stringify({
    type: 'subscribe',
    instanceId: 'test-instance',
  }));
  
  setTimeout(() => {
    console.log('Closing dashboard connection...');
    dashboardWs.close();
  }, 2000);
});

dashboardWs.on('message', (data) => {
  console.log('📨 Dashboard received:', data.toString().substring(0, 100));
});

dashboardWs.on('error', (error) => {
  console.error('❌ Dashboard WebSocket error:', error.message);
  console.error('   Code:', error.code);
});

dashboardWs.on('close', (code, reason) => {
  console.log('🔌 Dashboard connection closed (code:', code + ')');
  console.log('');
  
  // Test 2: Agent WebSocket (will fail without auth, but we can see the connection)
  console.log('=== Test 2: Agent WebSocket (/agent) - No Auth ===');
  console.log('Note: This will fail authentication, but we can test the connection');
  
  const agentWs = new WebSocket('wss://localhost:4000/agent', {
    rejectUnauthorized: false,
  });
  
  agentWs.on('open', () => {
    console.log('✅ Agent WebSocket connection opened!');
    console.log('⚠️  Will be closed by server due to missing auth...');
    
    // Don't send auth - let server close it
    setTimeout(() => {
      if (agentWs.readyState === WebSocket.OPEN) {
        agentWs.close();
      }
    }, 5000);
  });
  
  agentWs.on('error', (error) => {
    console.error('❌ Agent WebSocket error:', error.message);
  });
  
  agentWs.on('close', (code, reason) => {
    console.log('🔌 Agent connection closed');
    console.log('   Code:', code);
    console.log('   Reason:', reason.toString());
    console.log('');
    console.log('=== Test Complete ===');
    process.exit(0);
  });
  
  setTimeout(() => {
    if (agentWs.readyState !== WebSocket.OPEN && agentWs.readyState !== WebSocket.CLOSING) {
      console.log('⏱️  Agent connection timeout');
      process.exit(1);
    }
  }, 10000);
});

setTimeout(() => {
  if (dashboardWs.readyState !== WebSocket.OPEN) {
    console.log('⏱️  Dashboard connection timeout');
    process.exit(1);
  }
}, 5000);

