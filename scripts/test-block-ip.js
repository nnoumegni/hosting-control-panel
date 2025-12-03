#!/usr/bin/env node

/**
 * Test script to block IP address 172.59.129.68 from accessing EC2 instance i-0f5c110d53370ee3b
 * 
 * This script will:
 * 1. Configure firewall settings for the instance
 * 2. Create a deny rule for the IP
 * 3. Check sync status
 * 4. Verify the Network ACL rule in AWS
 * 5. Debug any issues
 * 
 * Usage:
 *   API_BASE_URL=http://localhost:4000/api node scripts/test-block-ip.js
 * 
 * Requirements:
 *   - Node.js 18+ (for native fetch support)
 *   - API server must be running
 *   - AWS credentials must be configured in server settings
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const TARGET_IP = process.env.TARGET_IP || '172.59.129.68';
const TARGET_INSTANCE_ID = process.env.TARGET_INSTANCE_ID || 'i-0f5c110d53370ee3b';

async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}/${endpoint}`;
  
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      throw new Error(
        `Cannot connect to API server at ${API_BASE_URL}.\n` +
        `Make sure the API server is running:\n` +
        `  yarn dev:api\n` +
        `Or check if the API_BASE_URL is correct.`
      );
    }
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(errorBody.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔍 Testing IP blocking for:', TARGET_IP);
  console.log('📦 Target instance:', TARGET_INSTANCE_ID);
  console.log('🌐 API URL:', API_BASE_URL);
  console.log('');

  // Check if API server is accessible
  console.log('Checking API server connection...');
  try {
    await apiFetch('health');
    console.log('✅ API server is accessible');
    console.log('');
  } catch (error) {
    console.error('❌ Cannot connect to API server:', error.message);
    console.error('');
    console.error('Please start the API server first:');
    console.error('  yarn dev:api');
    console.error('');
    console.error('Or if running in production:');
    console.error('  yarn workspace @hosting/api start');
    console.error('');
    process.exit(1);
  }

  try {
    // Step 1: Configure firewall settings for the instance
    console.log('Step 1: Configuring firewall settings for instance...');
    let autoConfigResult;
    try {
      autoConfigResult = await apiFetch('firewall/auto-configure', {
        method: 'POST',
        body: JSON.stringify({ instanceId: TARGET_INSTANCE_ID }),
      });
      console.log('✅ Auto-configuration result:', JSON.stringify(autoConfigResult, null, 2));
    } catch (error) {
      console.error('❌ Failed to auto-configure:', error.message);
      throw error;
    }

    if (!autoConfigResult.success) {
      throw new Error(`Auto-configuration failed: ${autoConfigResult.message || 'Unknown error'}`);
    }

    const { securityGroupId, networkAclId } = autoConfigResult;
    console.log(`   Security Group ID: ${securityGroupId || 'N/A'}`);
    console.log(`   Network ACL ID: ${networkAclId || 'N/A'}`);
    console.log('');

    if (!networkAclId) {
      console.error('❌ ERROR: Network ACL ID is required for deny rules (blocking)');
      console.error('   The instance subnet must have a Network ACL associated with it.');
      return;
    }

    // Step 2: Check current firewall settings
    console.log('Step 2: Checking current firewall settings...');
    const settings = await apiFetch('firewall/settings');
    console.log('✅ Current settings:', JSON.stringify(settings, null, 2));
    console.log('');

    // Step 3: Check if rule already exists
    console.log('Step 3: Checking existing firewall rules...');
    const existingRules = await apiFetch('firewall/rules');
    const existingRule = existingRules.items?.find(
      (rule) => rule.source === TARGET_IP && rule.action === 'deny'
    );
    
    if (existingRule) {
      console.log(`⚠️  Found existing deny rule for ${TARGET_IP}:`, existingRule.id);
      console.log('   Rule details:', JSON.stringify(existingRule, null, 2));
      console.log('');
      
      // Delete existing rule to start fresh
      console.log('   Deleting existing rule to start fresh...');
      try {
        await apiFetch(`firewall/rules/${existingRule.id}`, { method: 'DELETE' });
        console.log('   ✅ Deleted existing rule');
        await sleep(2000); // Wait for deletion to complete
      } catch (error) {
        console.error('   ⚠️  Failed to delete existing rule:', error.message);
      }
      console.log('');
    } else {
      console.log('   No existing deny rule found for this IP');
      console.log('');
    }

    // Step 4: Create deny rule
    console.log('Step 4: Creating deny rule for IP...');
    let newRule;
    try {
      newRule = await apiFetch('firewall/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: `Block ${TARGET_IP}`,
          description: `Test: Block IP ${TARGET_IP} from accessing instance ${TARGET_INSTANCE_ID}`,
          action: 'deny',
          direction: 'ingress',
          protocol: 'all',
          source: TARGET_IP,
          portRange: null,
          status: 'enabled',
        }),
      });
      console.log('✅ Rule created:', JSON.stringify(newRule, null, 2));
      console.log('');
    } catch (error) {
      console.error('❌ Failed to create rule:', error.message);
      throw error;
    }

    // Step 5: Wait for sync and check status
    console.log('Step 5: Waiting for sync to complete...');
    await sleep(3000); // Wait for background sync

    // Refresh rule to get updated sync status
    const updatedRule = await apiFetch(`firewall/rules/${newRule.id}`);
    console.log('📊 Rule sync status:', updatedRule.syncStatus);
    console.log('   Last sync:', updatedRule.lastSyncAt || 'Never');
    if (updatedRule.syncError) {
      console.log('   ⚠️  Sync error:', updatedRule.syncError);
    }
    console.log('   Full rule:', JSON.stringify(updatedRule, null, 2));
    console.log('');

    // Step 6: Manually trigger verification
    console.log('Step 6: Triggering manual verification...');
    try {
      const verifyResult = await apiFetch('firewall/verify', { method: 'POST' });
      console.log('✅ Verification result:', JSON.stringify(verifyResult, null, 2));
      console.log('');
    } catch (error) {
      console.error('⚠️  Verification failed:', error.message);
      console.log('');
    }

    // Step 7: Check rule status again after verification
    console.log('Step 7: Checking rule status after verification...');
    await sleep(2000);
    const finalRule = await apiFetch(`firewall/rules/${newRule.id}`);
    console.log('📊 Final sync status:', finalRule.syncStatus);
    console.log('   Last sync:', finalRule.lastSyncAt || 'Never');
    if (finalRule.syncError) {
      console.log('   ❌ Sync error:', finalRule.syncError);
    }
    console.log('   Full rule:', JSON.stringify(finalRule, null, 2));
    console.log('');

    // Step 8: Summary
    console.log('📋 Summary:');
    console.log(`   Rule ID: ${newRule.id}`);
    console.log(`   IP: ${TARGET_IP}`);
    console.log(`   Action: ${newRule.action}`);
    console.log(`   Status: ${newRule.status}`);
    console.log(`   Sync Status: ${finalRule.syncStatus}`);
    console.log(`   Security Group ID: ${securityGroupId || 'N/A'}`);
    console.log(`   Network ACL ID: ${networkAclId || 'N/A'}`);
    
    if (finalRule.syncStatus === 'synced') {
      console.log('');
      console.log('✅ SUCCESS: Rule is synced to AWS Network ACL');
      console.log(`   The IP ${TARGET_IP} should now be blocked from accessing the instance.`);
    } else if (finalRule.syncStatus === 'failed') {
      console.log('');
      console.log('❌ FAILED: Rule sync failed');
      console.log(`   Error: ${finalRule.syncError || 'Unknown error'}`);
      console.log('');
      console.log('🔍 Debugging steps:');
      console.log('   1. Check AWS credentials are valid');
      console.log('   2. Verify Network ACL ID is correct');
      console.log('   3. Check AWS permissions (ec2:ReplaceNetworkAclEntry)');
      console.log('   4. Verify the Network ACL exists in the configured region');
    } else if (finalRule.syncStatus === 'pending') {
      console.log('');
      console.log('⏳ PENDING: Rule is still syncing');
      console.log('   Wait a few seconds and check again');
    } else if (finalRule.syncStatus === 'not_applicable') {
      console.log('');
      console.log('⚠️  NOT APPLICABLE: Rule cannot be synced');
      console.log(`   Reason: ${finalRule.syncError || 'Unknown'}`);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

