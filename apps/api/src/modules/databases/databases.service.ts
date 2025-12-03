import { randomUUID } from 'crypto';
import {
  RDSClient,
  DescribeDBInstancesCommand,
  CreateDBInstanceCommand,
  ModifyDBInstanceCommand,
  DeleteDBInstanceCommand,
} from '@aws-sdk/client-rds';
import { HttpError } from '../../shared/errors.js';
import { logger } from '../../core/logger/index.js';
import { encryptSecret } from '@hosting/common';
import type { DatabaseCredentialsRepository } from './database-credentials.repository.js';

export interface AwsDatabase {
  id: string;
  engine: string;
  name: string;
  status: string;
  region: string;
  createdAt: string;
  endpoint?: string;
  plan?: string;
  settings?: Record<string, unknown>;
}

export class DatabasesService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<{ awsRegion: string | null; awsAccessKeyId: string | null; awsSecretAccessKey: string | null } | null> },
    private readonly credentialsRepository: DatabaseCredentialsRepository,
    private readonly credentialPassphrase: string | null,
  ) {}

  private async buildRdsClient(): Promise<RDSClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new HttpError('AWS credentials not configured. Please configure them in AWS Settings.', 400);
    }
    const region = serverSettings.awsRegion ?? 'us-east-1';
    return new RDSClient({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  async list(): Promise<{ items: AwsDatabase[] }> {
    try {
      const client = await this.buildRdsClient();
      const response = await client.send(
        new DescribeDBInstancesCommand({}),
      );

      const items: AwsDatabase[] =
        (response.DBInstances || []).map((inst) => ({
          id: inst.DBInstanceIdentifier ?? randomUUID(),
          name: inst.DBInstanceIdentifier ?? 'unknown',
          engine: inst.Engine ?? 'unknown',
          status: inst.DBInstanceStatus ?? 'unknown',
          region: client.config.region as string,
          createdAt: inst.InstanceCreateTime?.toISOString() ?? new Date().toISOString(),
          endpoint: inst.Endpoint?.Address ? `${inst.Endpoint.Address}:${inst.Endpoint.Port}` : undefined,
          settings: {
            instanceClass: inst.DBInstanceClass,
            storageType: inst.StorageType,
            allocatedStorage: inst.AllocatedStorage,
            multiAZ: inst.MultiAZ,
            publiclyAccessible: inst.PubliclyAccessible,
          },
        })) ?? [];

      return { items };
    } catch (error) {
      logger.error({ err: error }, 'Failed to list RDS instances');
      throw error;
    }
  }

  async purchase(input: Record<string, unknown>): Promise<{ id: string }> {
    const client = await this.buildRdsClient();

    const engine = String(input.engine ?? 'mysql');
    const instanceIdentifier = String(input.name ?? `db-${randomUUID().slice(0, 8)}`);
    const region = String(input.region ?? client.config.region ?? 'us-east-1');

    // Basic mapping for small dev/test instances
    const settings = (input.settings || {}) as any;
    const username = settings.username || 'admin';
    const password = settings.password || randomUUID().slice(0, 16);

    try {
      const response = await client.send(
        new CreateDBInstanceCommand({
          DBInstanceIdentifier: instanceIdentifier,
          Engine: engine,
          MasterUsername: username,
          MasterUserPassword: password,
          DBInstanceClass: settings.instanceSize || 'db.t3.micro',
          AllocatedStorage: settings.storageSize || 20,
          BackupRetentionPeriod: settings.backupRetention ?? 7,
          PubliclyAccessible: settings.publiclyAccessible ?? false,
          // For a real implementation we'd map VPC/subnets/security groups here
        }),
      );

      // Store credentials if encryption passphrase is configured
      // Note: Endpoint may not be available immediately during creation, but we store what we can
      if (this.credentialPassphrase) {
        try {
          const passwordEncrypted = encryptSecret(password, this.credentialPassphrase);
          const endpoint = response.DBInstance?.Endpoint;
          await this.credentialsRepository.create({
            databaseId: instanceIdentifier,
            username,
            passwordEncrypted,
            host: endpoint?.Address || '',
            port: endpoint?.Port || (engine === 'postgres' ? 5432 : engine === 'redis' ? 6379 : 3306),
            engine,
          });
          logger.info({ databaseId: instanceIdentifier }, 'Database credentials stored securely');
        } catch (err) {
          logger.error({ err, databaseId: instanceIdentifier }, 'Failed to store database credentials');
          // Don't fail the creation if credential storage fails
        }
      }

      logger.info({ instanceIdentifier, engine, region }, 'RDS instance creation initiated');
      return { id: instanceIdentifier };
    } catch (error) {
      logger.error({ err: error, engine, instanceIdentifier }, 'Failed to create RDS instance');
      throw error;
    }
  }

  async update(id: string, updates: Record<string, unknown>): Promise<void> {
    const client = await this.buildRdsClient();
    const settings = (updates.settings || {}) as any;

    try {
      await client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: id,
          AllocatedStorage: settings.storageSize,
          BackupRetentionPeriod: settings.backupRetention,
          DBInstanceClass: settings.instanceSize,
          PubliclyAccessible: settings.publiclyAccessible,
          ApplyImmediately: true,
        }),
      );

      logger.info({ id, updates }, 'RDS instance modification initiated');
    } catch (error) {
      logger.error({ err: error, id, updates }, 'Failed to modify RDS instance');
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const client = await this.buildRdsClient();
    try {
      await client.send(
        new DeleteDBInstanceCommand({
          DBInstanceIdentifier: id,
          SkipFinalSnapshot: true,
        }),
      );
      
      // Delete stored credentials
      try {
        await this.credentialsRepository.delete(id);
      } catch (err) {
        logger.warn({ err, databaseId: id }, 'Failed to delete database credentials');
      }

      logger.info({ id }, 'RDS instance delete initiated');
    } catch (error) {
      logger.error({ err: error, id }, 'Failed to delete RDS instance');
      throw error;
    }
  }

  async getCredentials(databaseId: string): Promise<{
    username: string;
    password: string;
    host: string;
    port: number;
    readReplicaHost?: string;
    readReplicaPort?: number;
    engine: string;
  } | null> {
    if (!this.credentialPassphrase) {
      throw new HttpError('Credential passphrase not configured. Cannot retrieve database credentials.', 500);
    }

    const credentials = await this.credentialsRepository.findByDatabaseId(databaseId);
    if (!credentials) {
      return null;
    }

    // If host is empty, fetch the current endpoint from AWS and update credentials
    let updatedCredentials: typeof credentials | null = credentials;
    if (!credentials.host || credentials.host.trim() === '') {
      try {
        const client = await this.buildRdsClient();
        const response = await client.send(
          new DescribeDBInstancesCommand({
            DBInstanceIdentifier: databaseId,
          }),
        );

        const instance = response.DBInstances?.[0];
        if (instance?.Endpoint?.Address) {
          await this.credentialsRepository.update(databaseId, {
            host: instance.Endpoint.Address,
            port: instance.Endpoint.Port || credentials.port,
          });
          updatedCredentials = await this.credentialsRepository.findByDatabaseId(databaseId);
          if (!updatedCredentials) {
            return null;
          }
          logger.info({ databaseId }, 'Updated database credentials with endpoint information');
        }
      } catch (err) {
        logger.warn({ err, databaseId }, 'Failed to fetch endpoint from AWS, using stored credentials');
        // Continue with existing credentials even if endpoint fetch fails
      }
    }

    // Ensure updatedCredentials is not null before using it
    if (!updatedCredentials) {
      return null;
    }

    try {
      const { decryptSecret } = await import('@hosting/common');
      const password = decryptSecret(updatedCredentials.passwordEncrypted, this.credentialPassphrase);

      return {
        username: updatedCredentials.username,
        password,
        host: updatedCredentials.host,
        port: updatedCredentials.port,
        readReplicaHost: updatedCredentials.readReplicaHost,
        readReplicaPort: updatedCredentials.readReplicaPort,
        engine: updatedCredentials.engine,
      };
    } catch (error) {
      logger.error({ err: error, databaseId }, 'Failed to decrypt database credentials');
      throw new HttpError('Failed to decrypt database credentials', 500);
    }
  }

  async resetPassword(databaseId: string, newPassword: string): Promise<void> {
    const client = await this.buildRdsClient();

    if (!this.credentialPassphrase) {
      throw new HttpError('Credential passphrase not configured. Cannot update database credentials.', 500);
    }

    try {
      // Update password in RDS
      await client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: databaseId,
          MasterUserPassword: newPassword,
          ApplyImmediately: true,
        }),
      );

      // Update stored credentials
      const credentials = await this.credentialsRepository.findByDatabaseId(databaseId);
      if (credentials) {
        const passwordEncrypted = encryptSecret(newPassword, this.credentialPassphrase);
        await this.credentialsRepository.update(databaseId, {
          passwordEncrypted,
        });
      }

      logger.info({ databaseId }, 'Database password reset successfully');
    } catch (error) {
      logger.error({ err: error, databaseId }, 'Failed to reset database password');
      throw error;
    }
  }
}


