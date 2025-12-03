import { DescribeNetworkAclsCommand, DescribeSecurityGroupsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from './server-settings-provider.js';

export interface SecurityGroup {
  id: string;
  name: string;
  description: string | null;
  vpcId: string | null;
}

export interface NetworkAcl {
  id: string;
  vpcId: string | null;
  isDefault: boolean;
}

export class ServerSettingsDiscoveryService {
  async discoverSecurityGroups(settings: ServerSettingsInternal | null): Promise<SecurityGroup[]> {
    if (!settings?.awsAccessKeyId || !settings?.awsSecretAccessKey) {
      throw new Error('AWS credentials are required to discover security groups.');
    }

    const region = settings.awsRegion ?? env.AWS_REGION;
    if (!region) {
      throw new Error('AWS region is required. Configure it in server settings.');
    }

    const client = new EC2Client({
      region,
      credentials: {
        accessKeyId: settings.awsAccessKeyId,
        secretAccessKey: settings.awsSecretAccessKey,
      },
    });

    try {
      const response = await client.send(new DescribeSecurityGroupsCommand({}));
      return (
        response.SecurityGroups?.map((sg) => ({
          id: sg.GroupId ?? '',
          name: sg.GroupName ?? '',
          description: sg.Description ?? null,
          vpcId: sg.VpcId ?? null,
        })) ?? []
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to discover security groups.');
      throw new Error(
        error instanceof Error && error.message ? error.message : 'Failed to discover security groups.',
      );
    }
  }

  async discoverNetworkAcls(settings: ServerSettingsInternal | null): Promise<NetworkAcl[]> {
    if (!settings?.awsAccessKeyId || !settings?.awsSecretAccessKey) {
      throw new Error('AWS credentials are required to discover network ACLs.');
    }

    const region = settings.awsRegion ?? env.AWS_REGION;
    if (!region) {
      throw new Error('AWS region is required. Configure it in server settings.');
    }

    const client = new EC2Client({
      region,
      credentials: {
        accessKeyId: settings.awsAccessKeyId,
        secretAccessKey: settings.awsSecretAccessKey,
      },
    });

    try {
      const response = await client.send(new DescribeNetworkAclsCommand({}));
      return (
        response.NetworkAcls?.map((acl) => ({
          id: acl.NetworkAclId ?? '',
          vpcId: acl.VpcId ?? null,
          isDefault: acl.IsDefault ?? false,
        })) ?? []
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to discover network ACLs.');
      throw new Error(
        error instanceof Error && error.message ? error.message : 'Failed to discover network ACLs.',
      );
    }
  }
}

