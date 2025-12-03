#!/usr/bin/env node

/**
 * Security Dashboard API Endpoint Performance Test
 * 
 * This script tests all API endpoints used by the security dashboard
 * and measures their response times to help identify performance bottlenecks.
 * 
 * Usage: node scripts/test-security-endpoints-performance.js [instanceId]
 */

const http = require('http');

const INSTANCE_IP = '54.214.70.207';
const AGENT_PORT = 9811;
const BASE_PATH = '/agent/requestlog';

// We need an instanceId - for now we'll try to get it from the API or use a placeholder
// In production, this would come from the selected instance
const INSTANCE_ID = process.argv[2] || 'i-placeholder';

const endpoints = [
  {
    name: 'Dashboard Summary',
    path: `${BASE_PATH}/dashboard/summary`,
    params: { days: 7 },
    description: 'Main dashboard metrics (total requests, unique IPs, high-risk indicators, attacks/min, threat categories)',
  },
  {
    name: 'Time Series (Hourly)',
    path: `${BASE_PATH}/dashboard/timeseries`,
    params: { interval: 'hour', days: 1 },
    description: 'Hourly time-series data for the timeline chart',
  },
  {
    name: 'Threat Categories',
    path: `${BASE_PATH}/dashboard/threat-categories`,
    params: { days: 7 },
    description: 'Threat category breakdown (brute_force, credential_stuffing, recon, etc.)',
  },
  {
    name: 'Top Offenders',
    path: `${BASE_PATH}/summary`,
    params: { minThreatScore: 30, limit: 20 },
    description: 'Top 20 high-threat IPs (minThreatScore: 30)',
  },
  {
    name: 'Country Distribution',
    path: `${BASE_PATH}/summary`,
    params: { groupBy: 'country', limit: 20, days: 7 },
    description: 'Country grouping for geo heatmap',
  },
  {
    name: 'ASN Distribution',
    path: `${BASE_PATH}/summary`,
    params: { limit: 200, days: 7 },
    description: 'IP summary for ASN aggregation (limit: 200)',
  },
  {
    name: 'CIDR Distribution',
    path: `${BASE_PATH}/summary`,
    params: { groupBy: 'cidr', cidrMask: 24, limit: 20, days: 7 },
    description: 'CIDR grouping for CIDR chart',
  },
  {
    name: 'Log View (Default)',
    path: `${BASE_PATH}/summary`,
    params: { limit: 100, days: 7 },
    description: 'Default log view data (limit: 100)',
  },
];

function buildUrl(path, params) {
  const url = new URL(`http://${INSTANCE_IP}:${AGENT_PORT}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  return url.toString();
}

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const request = http.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: true,
            duration,
            statusCode: response.statusCode,
            dataSize: data.length,
            recordCount: jsonData.results?.length || jsonData.points?.length || jsonData.length || 0,
          });
        } catch (e) {
          resolve({
            success: true,
            duration,
            statusCode: response.statusCode,
            dataSize: data.length,
            recordCount: 0,
            parseError: e.message,
          });
        }
      });
    });
    
    request.on('error', (error) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      reject({
        success: false,
        duration,
        error: error.message,
      });
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject({
        success: false,
        duration: 30000,
        error: 'Request timeout after 30s',
      });
    });
  });
}

async function testEndpoint(endpoint, iterations = 3) {
  const url = buildUrl(endpoint.path, endpoint.params);
  const results = [];
  
  console.log(`\n📊 Testing: ${endpoint.name}`);
  console.log(`   URL: ${url}`);
  console.log(`   Description: ${endpoint.description}`);
  console.log(`   Running ${iterations} iterations...`);
  
  for (let i = 0; i < iterations; i++) {
    try {
      const result = await makeRequest(url);
      results.push(result);
      process.stdout.write(`   ✓ Iteration ${i + 1}: ${result.duration}ms (${result.statusCode}, ${result.dataSize} bytes, ${result.recordCount} records)\n`);
    } catch (error) {
      results.push(error);
      process.stdout.write(`   ✗ Iteration ${i + 1}: ${error.duration}ms - ${error.error}\n`);
    }
  }
  
  const successful = results.filter(r => r.success);
  if (successful.length === 0) {
    return {
      endpoint: endpoint.name,
      success: false,
      error: 'All requests failed',
    };
  }
  
  const durations = successful.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const avgDataSize = successful.reduce((a, b) => a + (b.dataSize || 0), 0) / successful.length;
  const avgRecordCount = successful.reduce((a, b) => a + (b.recordCount || 0), 0) / successful.length;
  
  return {
    endpoint: endpoint.name,
    path: endpoint.path,
    params: endpoint.params,
    success: true,
    iterations: successful.length,
    avgDuration: Math.round(avgDuration),
    minDuration,
    maxDuration,
    avgDataSize: Math.round(avgDataSize),
    avgRecordCount: Math.round(avgRecordCount),
    successRate: (successful.length / iterations) * 100,
  };
}

async function runAllTests() {
  console.log('🚀 Security Dashboard API Performance Test');
  console.log('==========================================');
  console.log(`Instance IP: ${INSTANCE_IP}`);
  console.log(`Agent Port: ${AGENT_PORT}`);
  console.log(`Base Path: ${BASE_PATH}`);
  console.log(`\nTesting ${endpoints.length} endpoints...`);
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);
  }
  
  // Summary
  console.log('\n\n📈 PERFORMANCE SUMMARY');
  console.log('==========================================\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (successful.length > 0) {
    console.log('✅ Successful Endpoints:');
    console.log('─'.repeat(80));
    successful
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .forEach((result) => {
        const status = result.avgDuration > 2000 ? '🐌 SLOW' : result.avgDuration > 1000 ? '⚠️  MODERATE' : '✅ FAST';
        console.log(`${status} ${result.endpoint.padEnd(30)} | Avg: ${String(result.avgDuration).padStart(5)}ms | Min: ${String(result.minDuration).padStart(5)}ms | Max: ${String(result.maxDuration).padStart(5)}ms | ${result.avgDataSize} bytes | ${result.avgRecordCount} records`);
        console.log(`   Path: ${result.path}`);
        console.log(`   Params: ${JSON.stringify(result.params)}`);
      });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Endpoints:');
    console.log('─'.repeat(80));
    failed.forEach((result) => {
      console.log(`   ${result.endpoint}: ${result.error || 'Unknown error'}`);
    });
  }
  
  // Total time analysis
  const totalAvgTime = successful.reduce((sum, r) => sum + r.avgDuration, 0);
  const parallelTime = Math.max(...successful.map(r => r.avgDuration));
  
  console.log('\n\n⏱️  TIMING ANALYSIS');
  console.log('─'.repeat(80));
  console.log(`Total Sequential Time (if called one after another): ~${totalAvgTime}ms (~${(totalAvgTime / 1000).toFixed(2)}s)`);
  console.log(`Total Parallel Time (if called simultaneously): ~${parallelTime}ms (~${(parallelTime / 1000).toFixed(2)}s)`);
  console.log(`\n💡 The dashboard makes these calls in parallel, so the actual load time should be close to the parallel time.`);
  
  // Recommendations
  console.log('\n\n💡 OPTIMIZATION RECOMMENDATIONS');
  console.log('─'.repeat(80));
  const slowEndpoints = successful.filter(r => r.avgDuration > 2000);
  if (slowEndpoints.length > 0) {
    console.log('🐌 Slow endpoints (>2s) that need optimization:');
    slowEndpoints.forEach(r => {
      console.log(`   - ${r.endpoint}: ${r.avgDuration}ms avg`);
    });
  }
  
  const moderateEndpoints = successful.filter(r => r.avgDuration > 1000 && r.avgDuration <= 2000);
  if (moderateEndpoints.length > 0) {
    console.log('\n⚠️  Moderate endpoints (1-2s) that could be improved:');
    moderateEndpoints.forEach(r => {
      console.log(`   - ${r.endpoint}: ${r.avgDuration}ms avg`);
    });
  }
  
  console.log('\n✅ Fast endpoints (<1s):');
  const fastEndpoints = successful.filter(r => r.avgDuration <= 1000);
  fastEndpoints.forEach(r => {
    console.log(`   - ${r.endpoint}: ${r.avgDuration}ms avg`);
  });
}

// Run the tests
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

