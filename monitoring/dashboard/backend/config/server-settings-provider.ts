import { decryptSecret } from '@hosting/common';
import type {
  ServerSettingsRecord,
  ServerSettingsRepository,
} from './server-settings.repository.js';

export interface ServerSettingsInternal {
  name: string | null;
  awsRegion: string | null;
  awsAccessKeyId: string | null;
  awsSecretAccessKey: string | null;
  updatedAt: string | null;
}

export class ServerSettingsProvider {
  private cache: ServerSettingsInternal | null | undefined;

  constructor(
    private readonly repository: ServerSettingsRepository,
    private readonly credentialPassphrase?: string | null,
  ) {}

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
      console.warn(`FIREWALL_CREDENTIAL_PASSPHRASE is missing. Cannot decrypt ${label}.`);
      return null;
    }
    try {
      return decryptSecret(payload, passphrase);
    } catch (error) {
      console.error(
        `Failed to decrypt ${label}. This usually means the passphrase changed or the data is corrupted.`,
        error,
      );
      return null;
    }
  }
}

