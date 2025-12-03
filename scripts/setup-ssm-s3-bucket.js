#!/usr/bin/env node
/**
 * Script to create an S3 bucket for SSM command output storage
 * This is required to avoid SSM output truncation for large responses (>24KB)
 * 
 * Usage: cd monitoring/dashboard/backend && node ../../../scripts/setup-ssm-s3-bucket.js
 * Or: tsx scripts/setup-ssm-s3-bucket.js (from project root)
 */

import { S3Client, CreateBucketCommand, PutBucketVersioningCommand, PutBucketEncryptionCommand, GetBucketLocationCommand } from '@aws-sdk/client-s3';
import { getServerSettingsProvider } from '../../monitoring/dashboard/backend/config/server-settings.js';

async function createSSMBucket() {
  try {
    const serverSettingsProvider = getServerSettingsProvider();
    const settings = await serverSettingsProvider.getSettings();
    
    if (!settings) {
      throw new Error('Server settings not found. Please configure AWS credentials in AWS Settings.');
    }
    
    if (!settings.awsAccessKeyId || !settings.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
    }

    const region = settings.awsRegion || 'us-east-1';
    const bucketName = process.env.SSM_OUTPUT_S3_BUCKET || `ssm-command-output-${Date.now()}`;

    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: settings.awsAccessKeyId,
        secretAccessKey: settings.awsSecretAccessKey,
      },
    });

    console.log(`Creating S3 bucket: ${bucketName} in region: ${region}`);

    try {
      // Check if bucket already exists
      await s3Client.send(new GetBucketLocationCommand({ Bucket: bucketName }));
      console.log(`✅ Bucket ${bucketName} already exists`);
    } catch (error) {
      // Bucket doesn't exist, create it
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Create bucket
        const createParams = {
          Bucket: bucketName,
        };

        // For regions other than us-east-1, specify LocationConstraint
        if (region !== 'us-east-1') {
          createParams.CreateBucketConfiguration = {
            LocationConstraint: region,
          };
        }

        await s3Client.send(new CreateBucketCommand(createParams));
        console.log(`✅ Created bucket: ${bucketName}`);

        // Enable versioning (optional but recommended)
        try {
          await s3Client.send(new PutBucketVersioningCommand({
            Bucket: bucketName,
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          }));
          console.log(`✅ Enabled versioning on bucket: ${bucketName}`);
        } catch (versionError) {
          console.warn(`⚠️  Failed to enable versioning: ${versionError.message}`);
        }

        // Enable encryption (optional but recommended)
        try {
          await s3Client.send(new PutBucketEncryptionCommand({
            Bucket: bucketName,
            ServerSideEncryptionConfiguration: {
              Rules: [
                {
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: 'AES256',
                  },
                },
              ],
            },
          }));
          console.log(`✅ Enabled encryption on bucket: ${bucketName}`);
        } catch (encryptionError) {
          console.warn(`⚠️  Failed to enable encryption: ${encryptionError.message}`);
        }
      } else {
        throw error;
      }
    }

    console.log('\n✅ S3 bucket setup complete!');
    console.log(`\nTo use this bucket, set the following environment variable:`);
    console.log(`export SSM_OUTPUT_S3_BUCKET=${bucketName}`);
    console.log(`\nOr add it to your .env file:`);
    console.log(`SSM_OUTPUT_S3_BUCKET=${bucketName}`);
    console.log(`\nNote: Make sure your EC2 instance IAM role has permissions to write to this bucket.`);
    console.log(`Required IAM policy:`);
    console.log(`{`);
    console.log(`  "Effect": "Allow",`);
    console.log(`  "Action": ["s3:PutObject", "s3:GetObject"],`);
    console.log(`  "Resource": "arn:aws:s3:::${bucketName}/*"`);
    console.log(`}`);

  } catch (error) {
    console.error('❌ Failed to create S3 bucket:', error);
    process.exit(1);
  }
}

createSSMBucket();

