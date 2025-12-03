import type { ServerSettings } from '@hosting/common';

import { logger } from '../../core/logger/index.js';
import { decryptSecret, encryptSecret } from '@hosting/common';
import type {
  ServerSettingsRecord,
  ServerSettingsRepository,
  ServerSettingsUpdateInput,
} from './server-settings.repository.js';

export interface ServerSettingsInternal {
  name: string | null;
  awsRegion: string | null;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  updatedAt: string | null;
}

export interface ServerSettingsUpdateParams {
  name?: string | null;
  awsRegion?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  clearAwsSecretAccessKey?: boolean;
}

export class ServerSettingsProvider {
  private cache: ServerSettingsInternal | null | undefined;

  constructor(private readonly repository: ServerSettingsRepository, private readonly credentialPassphrase?: string | null) {}

  async getSettings(): Promise<ServerSettingsInternal | null> {
    if (this.cache !== undefined) {
      return this.cache;
    }

    const record = await this.repository.getSettings();
    if (!record) {
      this.cache = null;
      return null;
    }

    const internal = this.toInternal(record);
    
    // If decryption failed, clear the corrupted encrypted fields
    const needsCleanup =
      (record.awsAccessKeyIdEncrypted && !internal.awsAccessKeyId) ||
      (record.awsSecretAccessKeyEncrypted && !internal.awsSecretAccessKey);
    
    if (needsCleanup) {
      logger.warn('Clearing corrupted encrypted credentials from database.');
      // Clear corrupted encrypted fields asynchronously (don't block the request)
      this.repository
        .upsertSettings({
          awsAccessKeyIdEncrypted: record.awsAccessKeyIdEncrypted && !internal.awsAccessKeyId ? null : undefined,
          awsSecretAccessKeyEncrypted: record.awsSecretAccessKeyEncrypted && !internal.awsSecretAccessKey ? null : undefined,
        })
        .then(() => {
          this.invalidateCache(); // Clear cache so next read gets cleaned data
        })
        .catch((error) => {
          logger.error({ err: error }, 'Failed to clear corrupted encrypted credentials.');
        });
    }

    this.cache = internal;
    return internal;
  }

  async upsertSettings(params: ServerSettingsUpdateParams): Promise<ServerSettingsInternal> {
    // Invalidate cache before saving to ensure fresh data
    this.invalidateCache();
    
    const update: ServerSettingsUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(params, 'name')) {
      update.name = params.name ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'awsRegion')) {
      update.awsRegion = params.awsRegion ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'awsAccessKeyId')) {
      if (!params.awsAccessKeyId) {
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

  private toInternal(record: ServerSettingsRecord): ServerSettingsInternal {
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
      name: record.name ?? null,
      awsRegion: record.awsRegion ?? null,
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
      logger.warn(`FIREWALL_CREDENTIAL_PASSPHRASE is missing. Cannot decrypt ${label}.`);
      return null;
    }
    try {
      return decryptSecret(payload, passphrase);
    } catch (error) {
      logger.error(
        { err: error },
        `Failed to decrypt ${label}. This usually means the passphrase changed or the data is corrupted.`,
      );
      // Return null instead of throwing - allows user to re-enter credentials
      return null;
    }
  }

  private requirePassphrase(label: string): string {
    if (!this.credentialPassphrase) {
      throw new Error(`FIREWALL_CREDENTIAL_PASSPHRASE is required to store ${label}.`);
    }
    return this.credentialPassphrase;
  }

  toPublic(settings: ServerSettingsInternal | null): ServerSettings | null {
    if (!settings) {
      return null;
    }
    return {
      name: settings.name,
      awsRegion: settings.awsRegion,
      awsAccessKeyId: settings.awsAccessKeyId,
      hasAwsSecretAccessKey: Boolean(settings.awsSecretAccessKey),
      updatedAt: settings.updatedAt,
    };
  }
}

