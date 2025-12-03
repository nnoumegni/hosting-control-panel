#!/usr/bin/env node

/**
 * Test script to debug AWS credential validation
 * Usage: node test-aws-credentials.js
 */

import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

// TODO: Replace with environment variables or config file
// Never commit real credentials to git!
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
};

const regions = ['us-west-2', 'us-east-1', 'eu-west-1'];

async function testCredentials(region) {
  console.log(`\n🔍 Testing credentials with region: ${region}`);
  console.log(`   Access Key ID: ${credentials.accessKeyId}`);
  console.log(`   Secret Key: ${credentials.secretAccessKey.substring(0, 8)}...`);

  const client = new STSClient({
    region,
    credentials,
  });

  try {
    const command = new GetCallerIdentityCommand({});
    const response = await client.send(command);
    console.log(`✅ SUCCESS!`);
    console.log(`   Account: ${response.Account}`);
    console.log(`   ARN: ${response.Arn}`);
    console.log(`   User ID: ${response.UserId}`);
    return { success: true, region, response };
  } catch (error) {
    console.log(`❌ FAILED`);
    console.log(`   Error name: ${error.name}`);
    console.log(`   Error message: ${error.message}`);
    if (error.$metadata) {
      console.log(`   HTTP Status: ${error.$metadata.httpStatusCode}`);
      console.log(`   Request ID: ${error.$metadata.requestId}`);
    }
    if (error.Code) {
      console.log(`   AWS Error Code: ${error.Code}`);
    }
    if (error.stack) {
      console.log(`   Stack trace:\n${error.stack}`);
    }
    return { success: false, region, error };
  }
}

async function main() {
  console.log('🚀 Testing AWS Credentials\n');
  console.log('='.repeat(60));

  const results = [];

  // Test without region first (default behavior)
  console.log(`\n🔍 Testing credentials WITHOUT explicit region (default behavior)`);
  console.log(`   Access Key ID: ${credentials.accessKeyId}`);
  console.log(`   Secret Key: ${credentials.secretAccessKey.substring(0, 8)}...`);

  try {
    const client = new STSClient({
      credentials,
      // No region specified
    });
    const command = new GetCallerIdentityCommand({});
    const response = await client.send(command);
    console.log(`✅ SUCCESS!`);
    console.log(`   Account: ${response.Account}`);
    console.log(`   ARN: ${response.Arn}`);
    console.log(`   User ID: ${response.UserId}`);
    results.push({ success: true, region: 'default', response });
  } catch (error) {
    console.log(`❌ FAILED`);
    console.log(`   Error name: ${error.name}`);
    console.log(`   Error message: ${error.message}`);
    if (error.$metadata) {
      console.log(`   HTTP Status: ${error.$metadata.httpStatusCode}`);
      console.log(`   Request ID: ${error.$metadata.requestId}`);
    }
    if (error.Code) {
      console.log(`   AWS Error Code: ${error.Code}`);
    }
    results.push({ success: false, region: 'default', error });
  }

  // Test with each region
  for (const region of regions) {
    const result = await testCredentials(region);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    console.log(`\n✅ Successful regions:`);
    successful.forEach((r) => {
      console.log(`   - ${r.region}`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed regions:`);
    failed.forEach((r) => {
      console.log(`   - ${r.region}: ${r.error?.message || r.error?.name || 'Unknown error'}`);
    });
  }

  if (successful.length === 0) {
    console.log('\n⚠️  All tests failed. Possible issues:');
    console.log('   1. Invalid credentials');
    console.log('   2. Credentials are disabled or expired');
    console.log('   3. Network connectivity issues');
    console.log('   4. IAM permissions issue (credentials need sts:GetCallerIdentity permission)');
    console.log('   5. Region configuration issue');
    process.exit(1);
  } else {
    console.log('\n✅ At least one region works!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});

