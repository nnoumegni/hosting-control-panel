import {
  EC2Client,
  DescribeInstancesCommand,
  type DescribeInstancesCommandOutput,
  AssociateIamInstanceProfileCommand,
  Instance,
  type Reservation,
} from '@aws-sdk/client-ec2';
import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  PutRolePolicyCommand,
  CreateInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  GetInstanceProfileCommand,
} from '@aws-sdk/client-iam';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

export interface IamRoleSyncResult {
  roleCreated: boolean;
  instanceProfileCreated: boolean;
  attachedToInstances: string[];
}

export interface IamRoleSyncServiceOptions {
  /** How often we allow a sync to run (in ms). Default: 10 minutes. */
  syncIntervalMs?: number;
}

/**
 * This service:
 * - Ensures the JetCamerNetworkManagerRole exists
 * - Ensures the JetCamerNetworkManagerProfile instance profile exists
 * - Attaches the instance profile to all EC2 instances that don't yet have it
 * - Runs in a rate-limited way via syncIfStale()
 */
export class IamRoleSyncService {
  private readonly roleName = 'JetCamerNetworkManagerRole';
  private readonly instanceProfileName = 'JetCamerNetworkManagerProfile';
  private readonly syncIntervalMs: number;
  private lastSyncAt: number | null = null;
  private isSyncing = false;

  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
    options?: IamRoleSyncServiceOptions,
  ) {
    this.syncIntervalMs = options?.syncIntervalMs ?? 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Public entry point for callers (e.g. FirewallAutoConfigService).
   * Runs the full sync only if stale, in a fire-and-forget style.
   */
  async syncIfStale(): Promise<void> {
    const now = Date.now();
    if (this.isSyncing) {
      return;
    }

    if (this.lastSyncAt && now - this.lastSyncAt < this.syncIntervalMs) {
      // Not stale yet.
      return;
    }

    this.isSyncing = true;
    this.lastSyncAt = now;

    try {
      logger.info('[IamRoleSyncService] Starting IAM role auto-sync...');
      const result = await this.sync();
      logger.info(
        { result },
        '[IamRoleSyncService] IAM role sync completed',
      );
    } catch (err) {
      logger.error({ err }, '[IamRoleSyncService] IAM role sync failed');
      // Don't reset lastSyncAt here, to avoid hammering AWS on repeated errors.
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Full sync:
   * 1. Ensure role exists
   * 2. Ensure instance profile exists and contains the role
   * 3. Attach instance profile to all instances missing it
   */
  private async sync(): Promise<IamRoleSyncResult> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    const region = serverSettings.awsRegion ?? null;
    if (!region) {
      throw new Error('AWS region not configured');
    }

    const ec2 = new EC2Client({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });

    const iam = new IAMClient({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });

    let roleCreated = false;
    let instanceProfileCreated = false;

    const roleExists = await this.doesRoleExist(iam);
    if (!roleExists) {
      await this.createRole(iam);
      roleCreated = true;
    }

    const profileExists = await this.doesInstanceProfileExist(iam);
    if (!profileExists) {
      await this.createInstanceProfile(iam);
      instanceProfileCreated = true;
    }

    // Ensure role is in instance profile (idempotent if called multiple times)
    await this.ensureRoleInInstanceProfile(iam);

    // Attach instance profile to all EC2 instances that don't have it
    const attachedToInstances = await this.attachProfileToMissingInstances(ec2, iam);

    return { roleCreated, instanceProfileCreated, attachedToInstances };
  }

  // ─────────────────────────────────────────────
  // IAM: Role
  // ─────────────────────────────────────────────

  private async doesRoleExist(iam: IAMClient): Promise<boolean> {
    try {
      await iam.send(
        new GetRoleCommand({
          RoleName: this.roleName,
        }),
      );
      return true;
    } catch (err: any) {
      if (err?.name === 'NoSuchEntityException') {
        return false;
      }
      logger.error(
        { err },
        '[IamRoleSyncService] Error checking role existence',
      );
      throw err;
    }
  }

  private async createRole(iam: IAMClient): Promise<void> {
    logger.info(
      { roleName: this.roleName },
      '[IamRoleSyncService] Creating IAM role',
    );

    await iam.send(
      new CreateRoleCommand({
        RoleName: this.roleName,
        Description:
          'Allows EC2 instances to manage network ACLs for JetCamer Firewall Agent',
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

    // Attach the inline policy giving NACL permissions
    await iam.send(
      new PutRolePolicyCommand({
        RoleName: this.roleName,
        PolicyName: 'JetCamerNetworkAclPolicy',
        PolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'ec2:DescribeNetworkAcls',
                'ec2:CreateNetworkAclEntry',
                'ec2:ReplaceNetworkAclEntry',
                'ec2:DeleteNetworkAclEntry',
                'ec2:DescribeSubnets',
                'ec2:DescribeVpcs',
              ],
              Resource: '*',
            },
          ],
        }),
      }),
    );

    logger.info(
      { roleName: this.roleName },
      '[IamRoleSyncService] IAM role created and policy attached',
    );
  }

  // ─────────────────────────────────────────────
  // IAM: Instance Profile
  // ─────────────────────────────────────────────

  private async doesInstanceProfileExist(iam: IAMClient): Promise<boolean> {
    try {
      await iam.send(
        new GetInstanceProfileCommand({
          InstanceProfileName: this.instanceProfileName,
        }),
      );
      return true;
    } catch (err: any) {
      if (err?.name === 'NoSuchEntityException') {
        return false;
      }
      logger.error(
        { err },
        '[IamRoleSyncService] Error checking instance profile existence',
      );
      throw err;
    }
  }

  private async createInstanceProfile(iam: IAMClient): Promise<void> {
    logger.info(
      { instanceProfileName: this.instanceProfileName },
      '[IamRoleSyncService] Creating instance profile',
    );

    await iam.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: this.instanceProfileName,
      }),
    );

    logger.info(
      { instanceProfileName: this.instanceProfileName },
      '[IamRoleSyncService] Instance profile created',
    );
  }

  private async ensureRoleInInstanceProfile(iam: IAMClient): Promise<void> {
    logger.info(
      { roleName: this.roleName, instanceProfileName: this.instanceProfileName },
      '[IamRoleSyncService] Ensuring role is in instance profile',
    );

    const profile = await iam.send(
      new GetInstanceProfileCommand({
        InstanceProfileName: this.instanceProfileName,
      }),
    );

    const alreadyHasRole =
      profile.InstanceProfile?.Roles?.some((r) => r.RoleName === this.roleName) ||
      false;

    if (alreadyHasRole) {
      logger.info(
        '[IamRoleSyncService] Role already present in instance profile',
      );
      return;
    }

    await iam.send(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: this.instanceProfileName,
        RoleName: this.roleName,
      }),
    );

    logger.info(
      { roleName: this.roleName, instanceProfileName: this.instanceProfileName },
      '[IamRoleSyncService] Added role to instance profile',
    );
  }

  // ─────────────────────────────────────────────
  // EC2: Attach profile to instances missing it
  // ─────────────────────────────────────────────

  private async attachProfileToMissingInstances(ec2: EC2Client, _iam: IAMClient): Promise<string[]> {
    logger.info(
      '[IamRoleSyncService] Attaching instance profile to EC2 instances missing it',
    );

    const instances = await this.listAllInstances(ec2);
    const missing = instances.filter((instance) => {
      const profile = instance.IamInstanceProfile;
      if (!profile || !profile.Arn) return true;

      return !profile.Arn.includes(this.instanceProfileName);
    });

    const attachedIds: string[] = [];

    for (const instance of missing) {
      if (!instance.InstanceId) continue;

      logger.info(
        { instanceId: instance.InstanceId, instanceProfileName: this.instanceProfileName },
        '[IamRoleSyncService] Associating instance profile with instance',
      );

      try {
        await ec2.send(
          new AssociateIamInstanceProfileCommand({
            InstanceId: instance.InstanceId,
            IamInstanceProfile: {
              Name: this.instanceProfileName,
            },
          }),
        );

        attachedIds.push(instance.InstanceId);
      } catch (err) {
        logger.error(
          { err, instanceId: instance.InstanceId },
          '[IamRoleSyncService] Failed to associate instance profile with instance',
        );
      }
    }

    logger.info(
      { count: attachedIds.length },
      '[IamRoleSyncService] Instance profile attached to instances',
    );
    return attachedIds;
  }

  private async listAllInstances(ec2: EC2Client): Promise<Instance[]> {
    const instances: Instance[] = [];

    let nextToken: string | undefined = undefined;

    do {
      const resp: DescribeInstancesCommandOutput = await ec2.send(
        new DescribeInstancesCommand({
          NextToken: nextToken,
        }),
      );

      resp.Reservations?.forEach((reservation: Reservation) => {
        reservation.Instances?.forEach((instance: Instance) => {
          instances.push(instance);
        });
      });

      nextToken = resp.NextToken;
    } while (nextToken);

    return instances;
  }
}

