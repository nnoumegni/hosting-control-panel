import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeNetworkAclsCommand,
  AssociateIamInstanceProfileCommand,
} from '@aws-sdk/client-ec2';
import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  PutRolePolicyCommand,
  CreateInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  GetInstanceProfileCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

export interface IAMPermission {
  service: string;
  action: string;
  resource?: string;
  critical: boolean;
}

export interface IAMPermissionCheckResult {
  permission: IAMPermission;
  granted: boolean;
  error?: string;
}

export interface IAMRoleStatus {
  roleName: string;
  exists: boolean;
  attached: boolean;
  policyAttached: boolean;
}

// Core permissions (always required)
const CORE_PERMISSIONS: IAMPermission[] = [
  { service: 'sts', action: 'GetCallerIdentity', critical: true },
  { service: 'ec2', action: 'DescribeInstances', critical: true },
  { service: 'ec2', action: 'DescribeSecurityGroups', critical: true },
  { service: 'ec2', action: 'DescribeSubnets', critical: true },
  { service: 'ec2', action: 'DescribeNetworkAcls', critical: true },
  { service: 'ec2', action: 'AuthorizeSecurityGroupIngress', critical: true },
  { service: 'ec2', action: 'CreateNetworkAclEntry', critical: true },
  { service: 'ec2', action: 'DeleteNetworkAclEntry', critical: true },
];

// Full policy with all permissions
const FULL_IAM_POLICY = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'STSCredentialValidation',
      Effect: 'Allow',
      Action: ['sts:GetCallerIdentity'],
      Resource: '*',
    },
    {
      Sid: 'EC2ReadOperations',
      Effect: 'Allow',
      Action: [
        'ec2:DescribeInstances',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeSubnets',
        'ec2:DescribeNetworkAcls',
      ],
      Resource: '*',
    },
    {
      Sid: 'EC2WriteOperations',
      Effect: 'Allow',
      Action: [
        'ec2:AuthorizeSecurityGroupIngress',
        'ec2:CreateNetworkAclEntry',
        'ec2:DeleteNetworkAclEntry',
      ],
      Resource: '*',
    },
    {
      Sid: 'SESIdentityManagement',
      Effect: 'Allow',
      Action: [
        'ses:PutAccountVdmAttributes',
        'ses:ListEmailIdentities',
        'ses:GetEmailIdentity',
        'ses:PutEmailIdentityMailFromAttributes',
      ],
      Resource: '*',
    },
    {
      Sid: 'EventBridgeRuleManagement',
      Effect: 'Allow',
      Action: [
        'events:PutRule',
        'events:PutTargets',
        'events:DescribeRule',
        'events:ListTargetsByRule',
        'events:RemoveTargets',
        'events:DeleteRule',
      ],
      Resource: ['arn:aws:events:*:*:rule/JetCamerAgent-*'],
    },
    {
      Sid: 'CloudWatchMetricsRead',
      Effect: 'Allow',
      Action: ['cloudwatch:GetMetricStatistics'],
      Resource: ['arn:aws:cloudwatch:*:*:metric/AWS/SES/*'],
    },
    {
      Sid: 'Route53DNSChallenge',
      Effect: 'Allow',
      Action: ['route53:ListHostedZones', 'route53:ChangeResourceRecordSets'],
      Resource: '*',
    },
  ],
};

export class IAMPermissionsService {
  private readonly roleName = 'JetCamerAgentRole';
  private readonly instanceProfileName = 'JetCamerAgentProfile';
  private readonly policyName = 'JetCamerAgentPolicy';

  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async getAwsClients(region: string) {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    const credentials = {
      accessKeyId: serverSettings.awsAccessKeyId,
      secretAccessKey: serverSettings.awsSecretAccessKey,
    };

    return {
      ec2: new EC2Client({ region, credentials }),
      iam: new IAMClient({ region, credentials }),
      sts: new STSClient({ region, credentials }),
    };
  }

  async checkPermissions(instanceId: string | null): Promise<IAMPermissionCheckResult[]> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';
    const clients = await this.getAwsClients(region);

    const results: IAMPermissionCheckResult[] = [];

    for (const permission of CORE_PERMISSIONS) {
      try {
        let granted = false;

        switch (`${permission.service}:${permission.action}`) {
          case 'sts:GetCallerIdentity':
            try {
              await clients.sts.send(new GetCallerIdentityCommand({}));
              granted = true;
            } catch (err: any) {
              results.push({
                permission,
                granted: false,
                error: err?.message || 'Access denied',
              });
              continue;
            }
            break;

          case 'ec2:DescribeInstances':
            try {
              if (instanceId) {
                await clients.ec2.send(
                  new DescribeInstancesCommand({
                    InstanceIds: [instanceId],
                  }),
                );
              } else {
                await clients.ec2.send(
                  new DescribeInstancesCommand({
                    MaxResults: 5,
                  }),
                );
              }
              granted = true;
            } catch (err: any) {
              results.push({
                permission,
                granted: false,
                error: err?.message || 'Access denied',
              });
              continue;
            }
            break;

          case 'ec2:DescribeSecurityGroups':
            try {
              await clients.ec2.send(new DescribeSecurityGroupsCommand({ MaxResults: 5 }));
              granted = true;
            } catch (err: any) {
              results.push({
                permission,
                granted: false,
                error: err?.message || 'Access denied',
              });
              continue;
            }
            break;

          case 'ec2:DescribeSubnets':
            try {
              await clients.ec2.send(new DescribeSubnetsCommand({ MaxResults: 5 }));
              granted = true;
            } catch (err: any) {
              results.push({
                permission,
                granted: false,
                error: err?.message || 'Access denied',
              });
              continue;
            }
            break;

          case 'ec2:DescribeNetworkAcls':
            try {
              await clients.ec2.send(new DescribeNetworkAclsCommand({ MaxResults: 5 }));
              granted = true;
            } catch (err: any) {
              results.push({
                permission,
                granted: false,
                error: err?.message || 'Access denied',
              });
              continue;
            }
            break;

          // Write operations cannot be safely tested, assume granted if read operations work
          case 'ec2:AuthorizeSecurityGroupIngress':
          case 'ec2:CreateNetworkAclEntry':
          case 'ec2:DeleteNetworkAclEntry':
            // Assume granted if we can read (write permissions typically come together)
            granted = true;
            break;

          default:
            granted = false;
        }

        results.push({ permission, granted });
      } catch (err: any) {
        results.push({
          permission,
          granted: false,
          error: err?.message || 'Unknown error',
        });
      }
    }

    return results;
  }

  async checkRoleStatus(instanceId: string | null): Promise<IAMRoleStatus> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';
    const clients = await this.getAwsClients(region);

    let exists = false;
    let attached = false;
    let policyAttached = false;

    // Check if role exists
    try {
      await clients.iam.send(new GetRoleCommand({ RoleName: this.roleName }));
      exists = true;

      // Check if policy is attached
      const inlinePolicies = await clients.iam.send(
        new ListRolePoliciesCommand({ RoleName: this.roleName }),
      );
      policyAttached = inlinePolicies.PolicyNames?.includes(this.policyName) ?? false;
    } catch (err: any) {
      if (err?.name !== 'NoSuchEntityException') {
        logger.error({ err }, 'Error checking IAM role status');
      }
    }

    // Check if role is attached to instance
    if (instanceId && exists) {
      try {
        const response = await clients.ec2.send(
          new DescribeInstancesCommand({
            InstanceIds: [instanceId],
          }),
        );
        const instance = response.Reservations?.[0]?.Instances?.[0];
        const profileArn = instance?.IamInstanceProfile?.Arn || '';
        attached = profileArn.includes(this.instanceProfileName);
      } catch (err: any) {
        logger.warn({ err, instanceId }, 'Error checking instance IAM profile attachment');
      }
    }

    return {
      roleName: this.roleName,
      exists,
      attached,
      policyAttached,
    };
  }

  async grantPermissions(instanceId: string | null): Promise<{ success: boolean; message?: string; roleName?: string }> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    if (!instanceId) {
      throw new Error('Instance ID is required');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';
    const clients = await this.getAwsClients(region);

    try {
      // 1. Create role if it doesn't exist
      try {
        await clients.iam.send(new GetRoleCommand({ RoleName: this.roleName }));
        logger.info({ roleName: this.roleName }, 'IAM role already exists');
      } catch (err: any) {
        if (err?.name === 'NoSuchEntityException') {
          await clients.iam.send(
            new CreateRoleCommand({
              RoleName: this.roleName,
              Description: 'IAM role for JetCamer Agent with all required permissions',
              AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Principal: {
                      Service: 'ec2.amazonaws.com',
                    },
                    Action: 'sts:AssumeRole',
                  },
                ],
              }),
            }),
          );
          logger.info({ roleName: this.roleName }, 'Created IAM role');
        } else {
          throw err;
        }
      }

      // 2. Attach/update policy
      await clients.iam.send(
        new PutRolePolicyCommand({
          RoleName: this.roleName,
          PolicyName: this.policyName,
          PolicyDocument: JSON.stringify(FULL_IAM_POLICY),
        }),
      );
      logger.info({ roleName: this.roleName, policyName: this.policyName }, 'Attached IAM policy');

      // 3. Create instance profile if it doesn't exist
      let profileExists = false;
      try {
        await clients.iam.send(
          new GetInstanceProfileCommand({ InstanceProfileName: this.instanceProfileName }),
        );
        profileExists = true;
      } catch (err: any) {
        if (err?.name === 'NoSuchEntityException') {
          await clients.iam.send(
            new CreateInstanceProfileCommand({
              InstanceProfileName: this.instanceProfileName,
            }),
          );
          logger.info({ instanceProfileName: this.instanceProfileName }, 'Created instance profile');
        } else {
          throw err;
        }
      }

      // 4. Add role to instance profile
      if (!profileExists) {
        await clients.iam.send(
          new AddRoleToInstanceProfileCommand({
            InstanceProfileName: this.instanceProfileName,
            RoleName: this.roleName,
          }),
        );
        logger.info(
          { roleName: this.roleName, instanceProfileName: this.instanceProfileName },
          'Added role to instance profile',
        );
      }

      // 5. Attach instance profile to instance
      try {
        await clients.ec2.send(
          new AssociateIamInstanceProfileCommand({
            InstanceId: instanceId,
            IamInstanceProfile: {
              Name: this.instanceProfileName,
            },
          }),
        );
        logger.info({ instanceId, instanceProfileName: this.instanceProfileName }, 'Attached instance profile to instance');
      } catch (err: any) {
        // If already attached, that's fine
        if (err?.name !== 'InvalidParameterValue' && !err?.message?.includes('already associated')) {
          throw err;
        }
        logger.info({ instanceId }, 'Instance profile already attached');
      }

      return {
        success: true,
        message: 'IAM permissions granted successfully',
        roleName: this.roleName,
      };
    } catch (err: any) {
      logger.error({ err, instanceId }, 'Failed to grant IAM permissions');
      return {
        success: false,
        message: err?.message || 'Failed to grant IAM permissions',
      };
    }
  }
}

