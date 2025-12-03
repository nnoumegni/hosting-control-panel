import {
  DescribeInstancesCommand,
  DescribeNetworkAclsCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { logger } from '../../core/logger/index.js';
import { getEc2InstanceId, isRunningOnEc2 } from '../../shared/aws/ec2-instance-detection.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import type { FirewallSettingsProvider } from './firewall.settings-provider.js';
import type { IamRoleSyncService } from './iam-role-sync.service.js';

export interface Ec2Instance {
  instanceId: string;
  name: string | null;
  state: string;
  instanceType: string;
  privateIpAddress: string | null;
  publicIpAddress: string | null;
  securityGroupIds: string[];
  subnetId: string | null;
  vpcId: string | null;
  hasIamRole: boolean;
}

/**
 * Automatically discovers and configures Security Groups and Network ACLs
 * for firewall settings when AWS credentials are available.
 */
export class FirewallAutoConfigService {
  constructor(
    private readonly settingsProvider: FirewallSettingsProvider,
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
    private readonly iamRoleSyncService?: IamRoleSyncService,
  ) {}

  /**
   * List all EC2 instances in the configured region.
   * Automatically ensures IAM role and instance profile are configured (non-blocking).
   */
  async listInstances(): Promise<Ec2Instance[]> {
    // Ensure IAM role/profile/attachments are in good shape (rate-limited inside, non-blocking)
    if (this.iamRoleSyncService) {
      await this.iamRoleSyncService.syncIfStale().catch((err) => {
        // Log but don't block instance listing if IAM sync fails
        logger.warn({ err }, '[FirewallAutoConfigService] IAM role sync failed, continuing with instance listing');
      });
    }

    try {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured');
      }

      const region = serverSettings.awsRegion ?? null;
      if (!region) {
        throw new Error('AWS region not configured');
      }

      const client = new EC2Client({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });

      const response = await client.send(new DescribeInstancesCommand({}));
      const instances: Ec2Instance[] = [];
      const instanceProfileName = 'JetCamerNetworkManagerProfile';

      for (const reservation of response.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          // Get instance name from tags
          const nameTag = instance.Tags?.find((tag) => tag.Key === 'Name');
          const name = nameTag?.Value ?? null;

          // Check if instance has the IAM role attached
          const iamInstanceProfile = instance.IamInstanceProfile;
          const hasIamRole = iamInstanceProfile?.Arn?.includes(instanceProfileName) ?? false;

          instances.push({
            instanceId: instance.InstanceId ?? '',
            name,
            state: instance.State?.Name ?? 'unknown',
            instanceType: instance.InstanceType ?? 'unknown',
            privateIpAddress: instance.PrivateIpAddress ?? null,
            publicIpAddress: instance.PublicIpAddress ?? null,
            securityGroupIds: instance.SecurityGroups?.map((sg) => sg.GroupId ?? '').filter(Boolean) ?? [],
            subnetId: instance.SubnetId ?? null,
            vpcId: instance.VpcId ?? null,
            hasIamRole,
          });
        }
      }

      return instances;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list EC2 instances');
      throw error;
    }
  }

  /**
   * Get Security Group ID and Network ACL ID from a specific EC2 instance.
   */
  async getFirewallIdsFromInstance(instanceId: string): Promise<{ securityGroupId: string | null; networkAclId: string | null }> {
    try {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured');
      }

      const region = serverSettings.awsRegion ?? null;
      if (!region) {
        throw new Error('AWS region not configured');
      }

      const client = new EC2Client({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });

      // Get instance details
      const instanceResponse = await client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      const instance = instanceResponse.Reservations?.[0]?.Instances?.[0];
      if (!instance) {
        throw new Error(`Instance ${instanceId} not found`);
      }

      // Get primary Security Group ID (first one)
      const securityGroupId = instance.SecurityGroups?.[0]?.GroupId ?? null;

      // Get Network ACL ID from subnet
      let networkAclId: string | null = null;
      const subnetId = instance.SubnetId;

      if (subnetId) {
        // Get subnet details to find associated Network ACL
        const subnetResponse = await client.send(
          new DescribeSubnetsCommand({
            SubnetIds: [subnetId],
          }),
        );

        const subnet = subnetResponse.Subnets?.[0];
        const vpcId = subnet?.VpcId;

        if (vpcId) {
          // Get Network ACLs for the VPC
          const aclResponse = await client.send(
            new DescribeNetworkAclsCommand({
              Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
            }),
          );

          // Find ACL associated with the subnet, or use default
          const acls = aclResponse.NetworkAcls ?? [];
          const subnetAcl = acls.find((acl) => acl.Associations?.some((assoc) => assoc.SubnetId === subnetId));
          const defaultAcl = acls.find((acl) => acl.IsDefault);

          networkAclId = subnetAcl?.NetworkAclId ?? defaultAcl?.NetworkAclId ?? null;
        }
      }

      return { securityGroupId, networkAclId };
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to get firewall IDs from instance');
      throw error;
    }
  }

  /**
   * Auto-configure firewall settings by discovering AWS resources.
   * If running on EC2, automatically uses the current instance.
   * Otherwise, lists all instances for user selection.
   * This should be called when AWS credentials are first configured or on startup.
   */
  async autoConfigure(instanceId?: string): Promise<{ securityGroupId: string | null; networkAclId: string | null; instanceId?: string }> {
    try {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
        logger.debug('Skipping firewall auto-config: AWS credentials not configured in server settings.');
        return { securityGroupId: null, networkAclId: null };
      }

      const region = serverSettings.awsRegion ?? null;
      if (!region) {
        logger.debug('Skipping firewall auto-config: AWS region not configured.');
        return { securityGroupId: null, networkAclId: null };
      }

      // Get current firewall settings
      const currentSettings = await this.settingsProvider.getSettings();

      // Only auto-configure if settings are missing
      const needsSecurityGroup = !currentSettings?.securityGroupId;
      const needsNetworkAcl = !currentSettings?.networkAclId;

      logger.debug(
        { needsSecurityGroup, needsNetworkAcl, hasCurrentSettings: !!currentSettings },
        'Checking firewall settings auto-configuration needs.',
      );

      if (!needsSecurityGroup && !needsNetworkAcl) {
        logger.debug('Firewall settings already configured, skipping auto-config.');
        return {
          securityGroupId: currentSettings.securityGroupId,
          networkAclId: currentSettings.networkAclId,
        };
      }

      let securityGroupId: string | null = currentSettings?.securityGroupId ?? null;
      let networkAclId: string | null = currentSettings?.networkAclId ?? null;
      let detectedInstanceId: string | undefined = undefined;

      // If instance ID provided, use it
      if (instanceId) {
        logger.debug({ instanceId }, 'Using provided instance ID for auto-configuration');
        const result = await this.getFirewallIdsFromInstance(instanceId);
        securityGroupId = result.securityGroupId;
        networkAclId = result.networkAclId;
        detectedInstanceId = instanceId;
      } else if (await isRunningOnEc2()) {
        // Auto-detect instance ID if running on EC2
        const currentInstanceId = await getEc2InstanceId();
        if (currentInstanceId) {
          logger.info({ instanceId: currentInstanceId }, 'Detected EC2 instance, using it for auto-configuration');
          const result = await this.getFirewallIdsFromInstance(currentInstanceId);
          securityGroupId = result.securityGroupId;
          networkAclId = result.networkAclId;
          detectedInstanceId = currentInstanceId;
        } else {
          logger.warn('Running on EC2 but could not retrieve instance ID from metadata');
        }
      }

      // If we still need to discover (no instance ID and not on EC2, or instance discovery failed)
      if ((needsSecurityGroup && !securityGroupId) || (needsNetworkAcl && !networkAclId)) {
        logger.debug('Instance-based discovery not available, falling back to listing all resources');
        
        const client = new EC2Client({
          region,
          credentials: {
            accessKeyId: serverSettings.awsAccessKeyId,
            secretAccessKey: serverSettings.awsSecretAccessKey,
          },
        });

        // Discover Security Groups if needed
        if (needsSecurityGroup && !securityGroupId) {
          try {
            const response = await client.send(new DescribeSecurityGroupsCommand({}));
            const securityGroups = response.SecurityGroups ?? [];

            logger.debug({ count: securityGroups.length }, 'Discovered Security Groups for auto-configuration.');

            // Prefer non-default security groups, or use the first one
            const selectedGroup = securityGroups.find((sg) => sg.GroupName !== 'default') ?? securityGroups[0];

            if (selectedGroup?.GroupId) {
              securityGroupId = selectedGroup.GroupId;
              logger.info(
                { securityGroupId, groupName: selectedGroup.GroupName, totalGroups: securityGroups.length },
                'Auto-configured Security Group for firewall settings.',
              );
            } else {
              logger.warn({ totalGroups: securityGroups.length }, 'No Security Groups found for auto-configuration.');
            }
          } catch (error) {
            logger.error({ err: error }, 'Failed to discover Security Groups for auto-configuration.');
          }
        }

        // Discover Network ACLs if needed
        if (needsNetworkAcl && !networkAclId) {
          try {
            const response = await client.send(new DescribeNetworkAclsCommand({}));
            const networkAcls = response.NetworkAcls ?? [];

            logger.debug({ count: networkAcls.length }, 'Discovered Network ACLs for auto-configuration.');

            // Prefer default Network ACL, or use the first one
            const selectedAcl = networkAcls.find((acl) => acl.IsDefault) ?? networkAcls[0];

            if (selectedAcl?.NetworkAclId) {
              networkAclId = selectedAcl.NetworkAclId;
              logger.info(
                { networkAclId, isDefault: selectedAcl.IsDefault, totalAcls: networkAcls.length },
                'Auto-configured Network ACL for firewall settings.',
              );
            } else {
              logger.warn({ totalAcls: networkAcls.length }, 'No Network ACLs found for auto-configuration.');
            }
          } catch (error) {
            logger.error({ err: error }, 'Failed to discover Network ACLs for auto-configuration.');
          }
        }
      }

      // Save the discovered IDs if we found any changes
      const hasChanges =
        securityGroupId !== currentSettings?.securityGroupId || networkAclId !== currentSettings?.networkAclId;

      if (hasChanges) {
        // Always save both values, even if one is null, to ensure we update the database
        await this.settingsProvider.upsertSettings({
          securityGroupId: securityGroupId ?? null,
          networkAclId: networkAclId ?? null,
        });
        logger.info(
          { securityGroupId, networkAclId, hadSecurityGroup: !!currentSettings?.securityGroupId, hadNetworkAcl: !!currentSettings?.networkAclId },
          'Auto-configured firewall settings with discovered AWS resources.',
        );
      } else {
        logger.debug(
          { securityGroupId, networkAclId },
          'No changes to firewall settings, skipping save.',
        );
      }

      return { securityGroupId, networkAclId, instanceId: detectedInstanceId };
    } catch (error) {
      logger.error({ err: error }, 'Failed to auto-configure firewall settings.');
      return { securityGroupId: null, networkAclId: null };
    }
  }

  /**
   * Build an EC2 client using server settings credentials.
   */
  private async buildClient(): Promise<EC2Client> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    const region = serverSettings.awsRegion ?? null;
    if (!region) {
      throw new Error('AWS region not configured');
    }

    return new EC2Client({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Start an EC2 instance.
   */
  async startInstance(instanceId: string): Promise<void> {
    try {
      const client = await this.buildClient();
      await client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
      logger.info({ instanceId }, 'Started EC2 instance');
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to start EC2 instance');
      throw error;
    }
  }

  /**
   * Stop an EC2 instance.
   */
  async stopInstance(instanceId: string): Promise<void> {
    try {
      const client = await this.buildClient();
      await client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
      logger.info({ instanceId }, 'Stopped EC2 instance');
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to stop EC2 instance');
      throw error;
    }
  }

  /**
   * Terminate an EC2 instance.
   */
  async terminateInstance(instanceId: string): Promise<void> {
    try {
      const client = await this.buildClient();
      await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
      logger.info({ instanceId }, 'Terminated EC2 instance');
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to terminate EC2 instance');
      throw error;
    }
  }
}

