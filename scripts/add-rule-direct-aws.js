#!/usr/bin/env node

/**
 * Script to add a firewall rule directly to AWS using the SDK
 * This bypasses the API and adds the rule directly to test the UI display
 */

import { EC2Client, CreateNetworkAclEntryCommand, DescribeNetworkAclsCommand } from '@aws-sdk/client-ec2';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const TARGET_IP = process.env.TARGET_IP || '172.59.129.68';
const NETWORK_ACL_ID = process.env.NETWORK_ACL_ID || 'acl-071187fc24002b300';
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
// Never commit real credentials to git! Use environment variables.
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error('Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set as environment variables');
  process.exit(1);
}

// Convert IP to CIDR if needed
const normalizeIp = (ip) => {
  if (ip.includes('/')) {
    return ip;
  }
  if (ip.includes(':')) {
    return `${ip}/128`; // IPv6
  }
  return `${ip}/32`; // IPv4
};

// Calculate rule number from a hash (similar to what the API does)
const calculateRuleNumber = (id, direction, targetKind) => {
  const base = parseInt(id.slice(-4), 16);
  const normalized = (Number.isNaN(base) ? 0 : base) % 15000;
  const offset = direction === 'ingress' ? 100 : 17000;
  const kindOffset = targetKind === 'ipv6' ? 500 : 0;
  return offset + normalized + kindOffset;
};

// Generate a temp ID from IP
const generateTempId = (ip) => {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(4, '0');
};

async function main() {
  console.log(`🔍 Adding firewall rule directly to AWS`);
  console.log(`   IP: ${TARGET_IP}`);
  console.log(`   Network ACL ID: ${NETWORK_ACL_ID}`);
  console.log(`   Region: ${AWS_REGION}\n`);

  // Create AWS clients
  const ec2Client = new EC2Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  const stsClient = new STSClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  // Verify credentials
  try {
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    console.log(`✅ AWS credentials verified`);
    console.log(`   Account: ${identity.Account}`);
    console.log(`   User/Role: ${identity.Arn}\n`);
  } catch (error) {
    console.error(`❌ Failed to verify AWS credentials:`, error.message);
    process.exit(1);
  }

  // Normalize IP to CIDR
  const cidrBlock = normalizeIp(TARGET_IP);
  const isIpv6 = cidrBlock.includes(':');
  
  console.log(`📝 Rule details:`);
  console.log(`   CIDR: ${cidrBlock}`);
  console.log(`   Type: ${isIpv6 ? 'IPv6' : 'IPv4'}`);
  console.log(`   Direction: ingress`);
  console.log(`   Protocol: All (-1)`);
  console.log(`   Action: deny\n`);

  // First, check existing rules to find an available rule number
  console.log(`🔍 Checking existing Network ACL rules...`);
  let ruleNumber = 150; // Default starting point
  
  try {
    const describeCommand = new DescribeNetworkAclsCommand({
      NetworkAclIds: [NETWORK_ACL_ID],
    });
    const describeResponse = await ec2Client.send(describeCommand);
    const networkAcl = describeResponse.NetworkAcls?.[0];
    
    if (networkAcl) {
      const existingIngressRules = networkAcl.Entries?.filter(e => !e.Egress) || [];
      const usedRuleNumbers = new Set(existingIngressRules.map(r => r.RuleNumber));
      console.log(`   Found ${existingIngressRules.length} existing ingress rules`);
      console.log(`   Used rule numbers: ${Array.from(usedRuleNumbers).sort((a, b) => a - b).join(', ')}\n`);
      
      // Find an available rule number (start from 150, go up to 32766)
      ruleNumber = 150;
      while (usedRuleNumbers.has(ruleNumber) && ruleNumber < 32766) {
        ruleNumber++;
      }
      
      if (ruleNumber >= 32766) {
        throw new Error('No available rule numbers in Network ACL');
      }
      
      console.log(`🔢 Using available rule number: ${ruleNumber}\n`);
    } else {
      throw new Error('Network ACL not found');
    }
  } catch (error) {
    console.error(`⚠️  Failed to check existing rules:`, error.message);
    // Fallback to a calculated rule number
    const tempId = generateTempId(TARGET_IP);
    ruleNumber = calculateRuleNumber(tempId, 'ingress', isIpv6 ? 'ipv6' : 'ipv4');
    if (ruleNumber < 150) {
      ruleNumber = 150 + (ruleNumber % 100);
    }
    console.log(`🔢 Using fallback rule number: ${ruleNumber}\n`);
  }

  // Create the Network ACL entry
  const command = new CreateNetworkAclEntryCommand({
    NetworkAclId: NETWORK_ACL_ID,
    RuleNumber: ruleNumber,
    Protocol: '-1', // All protocols
    RuleAction: 'deny',
    Egress: false, // ingress
    ...(isIpv6 ? { Ipv6CidrBlock: cidrBlock } : { CidrBlock: cidrBlock }),
  });

  try {
    console.log(`🚀 Adding rule to AWS Network ACL...`);
    await ec2Client.send(command);
    console.log(`✅ Successfully added rule to AWS Network ACL!`);
    console.log(`\n📋 Rule details:`);
    console.log(`   Network ACL ID: ${NETWORK_ACL_ID}`);
    console.log(`   Rule Number: ${ruleNumber}`);
    console.log(`   CIDR Block: ${cidrBlock}`);
    console.log(`   Action: deny`);
    console.log(`   Direction: ingress (Egress: false)`);
    console.log(`   Protocol: All (-1)\n`);
    console.log(`✨ The rule should now appear in the UI's "AWS Rules" tab!`);
    console.log(`   Refresh the page and check the "AWS Rules" tab to see it.`);
  } catch (error) {
    console.error(`❌ Failed to add rule to AWS:`, error.message);
    if (error.name === 'InvalidNetworkAclEntry.Duplicate') {
      console.log(`\n⚠️  Rule already exists in AWS. This is okay - it means the rule is already applied.`);
    } else {
      console.error(`\nError details:`, error);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

