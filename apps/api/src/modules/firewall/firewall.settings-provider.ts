import { logger } from '../../core/logger/index.js';
import { decryptSecret, encryptSecret } from '@hosting/common';
import type {
  FirewallSettingsRecord,
  FirewallSettingsRepository,
  FirewallSettingsUpdateInput,
} from './firewall.settings.repository.js';

interface Defaults {
  securityGroupId?: string | null;
  networkAclId?: string | null;
}

export interface FirewallSettingsInternal {
  securityGroupId: string | null;
  networkAclId: string | null;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  updatedAt: string | null;
}

export interface FirewallSettingsUpdateParams {
  securityGroupId?: string | null;
  networkAclId?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  clearAwsSecretAccessKey?: boolean;
}

export class FirewallSettingsProvider {
  private cache: FirewallSettingsInternal | null | undefined;

  constructor(
    private readonly repository: FirewallSettingsRepository,
    private readonly defaults: Defaults = {},
    private readonly credentialPassphrase?: string | null,
  ) {}

  async getSettings(): Promise<FirewallSettingsInternal | null> {
    if (this.cache !== undefined) {
      return this.cache;
    }

    let record = await this.repository.getSettings();
    if (!record && (this.defaults.securityGroupId !== undefined || this.defaults.networkAclId !== undefined)) {
      record = await this.repository.upsertSettings({
        securityGroupId: this.defaults.securityGroupId ?? null,
        networkAclId: this.defaults.networkAclId ?? null,
      });
    }

    if (!record) {
      this.cache = null;
      return null;
    }

    const internal = this.toInternal(record);
    this.cache = internal;
    return internal;
  }

  async upsertSettings(params: FirewallSettingsUpdateParams): Promise<FirewallSettingsInternal> {
    const update: FirewallSettingsUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(params, 'securityGroupId')) {
      update.securityGroupId = params.securityGroupId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'networkAclId')) {
      update.networkAclId = params.networkAclId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'awsAccessKeyId')) {
      if (params.awsAccessKeyId == null || params.awsAccessKeyId === '') {
        update.awsAccessKeyIdEncrypted = null;
      } else {
        update.awsAccessKeyIdEncrypted = encryptSecret(
          params.awsAccessKeyId,
          this.requirePassphrase('AWS access key ID'),
        );
      }
    }

    if (params.clearAwsSecretAccessKey) {
      update.awsSecretAccessKeyEncrypted = null;
    } else if (Object.prototype.hasOwnProperty.call(params, 'awsSecretAccessKey')) {
      if (!params.awsSecretAccessKey) {
        update.awsSecretAccessKeyEncrypted = null;
      } else {
        update.awsSecretAccessKeyEncrypted = encryptSecret(
          params.awsSecretAccessKey,
          this.requirePassphrase('AWS secret access key'),
        );
      }
    }

    const record = await this.repository.upsertSettings(update);
    const internal = this.toInternal(record);
    this.cache = internal;
    return internal;
  }

  invalidateCache() {
    this.cache = undefined;
  }

  private toInternal(record: FirewallSettingsRecord): FirewallSettingsInternal {
    const passphrase = this.credentialPassphrase ?? undefined;

    let awsAccessKeyId: string | null = null;
    if (record.awsAccessKeyIdEncrypted) {
      awsAccessKeyId = this.decrypt(record.awsAccessKeyIdEncrypted, passphrase, 'AWS access key ID');
    }

    let awsSecretAccessKey: string | null = null;
    if (record.awsSecretAccessKeyEncrypted) {
      awsSecretAccessKey = this.decrypt(record.awsSecretAccessKeyEncrypted, passphrase, 'AWS secret access key');
    }

    return {
      securityGroupId: record.securityGroupId ?? null,
      networkAclId: record.networkAclId ?? null,
      awsAccessKeyId,
      awsSecretAccessKey,
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
    };
  }

  private decrypt(payload: string, passphrase: string | undefined, label: string): string | null {
    if (!payload) {
      return null;
    }

    if (!passphrase) {
      throw new Error(`Missing FIREWALL_CREDENTIAL_PASSPHRASE to decrypt ${label}.`);
    }

    try {
      return decryptSecret(payload, passphrase);
    } catch (error) {
      logger.error({ err: error }, `Failed to decrypt ${label}.`);
      throw error;
    }
  }

  private requirePassphrase(label: string): string {
    if (!this.credentialPassphrase) {
      throw new Error(`FIREWALL_CREDENTIAL_PASSPHRASE is required to store ${label}.`);
    }
    return this.credentialPassphrase;
  }
}

