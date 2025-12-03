#!/usr/bin/env node

/**
 * Test script to validate data consistency from the agent's security endpoints.
 * Makes 10 consecutive requests (1 per second) to check if responses are consistent.
 */

const http = require('http');

const AGENT_IP = '54.214.70.207';
const AGENT_PORT = 9811;
const BASE_URL = `http://${AGENT_IP}:${AGENT_PORT}`;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function makeRequest(endpoint, params = {}) {
  return new Promise((resolve) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });

    const startTime = Date.now();
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;

        if (res.statusCode !== 200) {
          resolve({
            success: false,
            status: res.statusCode,
            error: data || 'Unknown error',
            duration,
          });
          return;
        }

        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: true,
            status: res.statusCode,
            data: jsonData,
            duration,
          });
        } catch (parseError) {
          resolve({
            success: false,
            error: `JSON parse error: ${parseError.message}`,
            duration,
          });
        }
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        error: error.message || String(error),
        duration,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        error: 'Request timeout',
        duration,
      });
    });

    req.end();
  });
}

function analyzeResponses(responses, endpointName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Analysis for: ${endpointName}`);
  console.log('='.repeat(80));

  const successful = responses.filter(r => r.success);
  const failed = responses.filter(r => !r.success);

  console.log(`\n✅ Successful requests: ${successful.length}/${responses.length}`);
  console.log(`❌ Failed requests: ${failed.length}/${responses.length}`);

  if (failed.length > 0) {
    console.log('\nFailed requests:');
    failed.forEach((r, i) => {
      console.log(`  Request ${i + 1}: ${r.error || `HTTP ${r.status}`}`);
    });
  }

  if (successful.length === 0) {
    console.log('\n⚠️  No successful requests to analyze!');
    return;
  }

  // Analyze data consistency
  const firstResponse = successful[0].data;
  const allGroups = successful.map(r => r.data?.groups || []);
  const allGroupsLengths = allGroups.map(g => g.length);

  console.log('\n📊 Data Consistency Analysis:');
  console.log(`  Groups count - Min: ${Math.min(...allGroupsLengths)}, Max: ${Math.max(...allGroupsLengths)}, Avg: ${(allGroupsLengths.reduce((a, b) => a + b, 0) / allGroupsLengths.length).toFixed(1)}`);

  // Check if groups array exists
  const hasGroups = successful.every(r => Array.isArray(r.data?.groups));
  console.log(`  Has 'groups' array: ${hasGroups ? '✅ Yes' : '❌ No'}`);

  if (!hasGroups) {
    console.log('\n⚠️  Some responses are missing the "groups" field!');
    successful.forEach((r, i) => {
      if (!Array.isArray(r.data?.groups)) {
        console.log(`  Request ${i + 1}: Missing or invalid groups field`);
        console.log(`    Response keys: ${Object.keys(r.data || {}).join(', ')}`);
      }
    });
  }

  // Check if groups are empty
  const emptyGroups = allGroups.filter(g => g.length === 0).length;
  console.log(`  Empty groups arrays: ${emptyGroups}/${successful.length}`);

  if (emptyGroups === successful.length) {
    console.log('\n⚠️  All responses have empty groups arrays - agent may not have data for this grouping');
    return;
  }

  // Compare first response with others
  const firstGroups = firstResponse?.groups || [];
  const inconsistencies = [];

  successful.slice(1).forEach((response, index) => {
    const currentGroups = response.data?.groups || [];
    
    // Check length
    if (currentGroups.length !== firstGroups.length) {
      inconsistencies.push({
        request: index + 2,
        type: 'length_mismatch',
        first: firstGroups.length,
        current: currentGroups.length,
      });
    }

    // Check if keys are consistent (sample first 5)
    const firstKeys = firstGroups.slice(0, 5).map(g => g.key).sort();
    const currentKeys = currentGroups.slice(0, 5).map(g => g.key).sort();
    
    if (JSON.stringify(firstKeys) !== JSON.stringify(currentKeys)) {
      inconsistencies.push({
        request: index + 2,
        type: 'keys_mismatch',
        first: firstKeys,
        current: currentKeys,
      });
    }

    // Check data types
    if (firstGroups.length > 0 && currentGroups.length > 0) {
      const firstSample = firstGroups[0];
      const currentSample = currentGroups[0];
      
      const firstKeysInSample = Object.keys(firstSample).sort();
      const currentKeysInSample = Object.keys(currentSample).sort();
      
      if (JSON.stringify(firstKeysInSample) !== JSON.stringify(currentKeysInSample)) {
        inconsistencies.push({
          request: index + 2,
          type: 'structure_mismatch',
          first: firstKeysInSample,
          current: currentKeysInSample,
        });
      }
    }
  });

  if (inconsistencies.length === 0) {
    console.log('\n✅ All responses are consistent!');
  } else {
    console.log(`\n⚠️  Found ${inconsistencies.length} inconsistency(ies):`);
    inconsistencies.forEach(inc => {
      console.log(`  Request ${inc.request}:`);
      if (inc.type === 'length_mismatch') {
        console.log(`    Length mismatch: First=${inc.first}, Current=${inc.current}`);
      } else if (inc.type === 'keys_mismatch') {
        console.log(`    Keys mismatch:`);
        console.log(`      First: ${inc.first.join(', ')}`);
        console.log(`      Current: ${inc.current.join(', ')}`);
      } else if (inc.type === 'structure_mismatch') {
        console.log(`    Structure mismatch:`);
        console.log(`      First: ${inc.first.join(', ')}`);
        console.log(`      Current: ${inc.current.join(', ')}`);
      }
    });
  }

  // Show sample data from first response
  if (firstGroups.length > 0) {
    console.log('\n📋 Sample data from first response:');
    firstGroups.slice(0, 3).forEach((group, i) => {
      console.log(`  ${i + 1}. Key: "${group.key}", Count: ${group.count}`);
    });
  } else {
    console.log('\n📋 First response has no groups data');
  }

  // Performance stats
  const durations = successful.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  console.log('\n⏱️  Performance:');
  console.log(`  Average: ${avgDuration.toFixed(0)}ms`);
  console.log(`  Min: ${minDuration}ms`);
  console.log(`  Max: ${maxDuration}ms`);
}

async function testEndpoint(endpoint, params, endpointName) {
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`Testing: ${endpointName}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Parameters: ${JSON.stringify(params, null, 2)}`);
  console.log('#'.repeat(80));

  const responses = [];

  for (let i = 1; i <= 10; i++) {
    console.log(`\n[${i}/10] Making request...`);
    const result = await makeRequest(endpoint, params);
    
    if (result.success) {
      const groupsCount = result.data?.groups?.length || 0;
      console.log(`  ✅ Success (${result.duration}ms) - Groups: ${groupsCount}`);
    } else {
      console.log(`  ❌ Failed: ${result.error || `HTTP ${result.status}`}`);
    }

    responses.push(result);

    // Wait 1 second before next request (except for the last one)
    if (i < 10) {
      await delay(1000);
    }
  }

  analyzeResponses(responses, endpointName);
}

async function main() {
  console.log('🔍 Security Data Consistency Test');
  console.log(`Agent: ${AGENT_IP}:${AGENT_PORT}`);
  console.log(`Date: ${new Date().toISOString()}`);

  // Test Country endpoint
  await testEndpoint(
    '/agent/requestlog/summary',
    {
      groupBy: 'country',
      limit: 20,
      days: 7,
    },
    'Country Distribution (groupBy=country)'
  );

  // Wait 2 seconds between endpoint tests
  await delay(2000);

  // Test CIDR endpoint
  await testEndpoint(
    '/agent/requestlog/summary',
    {
      groupBy: 'cidr',
      cidrMask: 24,
      limit: 20,
      days: 7,
    },
    'CIDR Distribution (groupBy=cidr)'
  );

  console.log('\n' + '='.repeat(80));
  console.log('✅ Test completed!');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

