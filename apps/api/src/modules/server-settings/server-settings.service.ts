import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { ServerSettings } from '@hosting/common';

import type { ServerSettingsInternal, ServerSettingsUpdateParams } from './server-settings-provider.js';
import { ServerSettingsProvider } from './server-settings-provider.js';

export class ServerSettingsService {
  constructor(private readonly provider: ServerSettingsProvider) {}

  async getSettings(): Promise<ServerSettings | null> {
    const settings = await this.provider.getSettings();
    return this.provider.toPublic(settings);
  }

  async getInternal(): Promise<ServerSettingsInternal | null> {
    return this.provider.getSettings();
  }

  async updateSettings(params: ServerSettingsUpdateParams): Promise<ServerSettings> {
    const normalized: ServerSettingsUpdateParams = {
      ...params,
      name: params.name?.trim() ? params.name.trim() : null,
      awsRegion: params.awsRegion?.trim() ? params.awsRegion.trim() : null,
      awsAccessKeyId: params.awsAccessKeyId?.trim() ? params.awsAccessKeyId.trim() : null,
      awsSecretAccessKey: params.clearAwsSecretAccessKey
        ? undefined
        : params.awsSecretAccessKey?.trim() ? params.awsSecretAccessKey.trim() : undefined,
    };

    // Get current settings for validation (decryption errors are handled gracefully)
    let current: ServerSettingsInternal | null = null;
    try {
      current = await this.provider.getSettings();
    } catch (error) {
      // If we can't read current settings, continue with null (user can still save new credentials)
    }

    // Validate credentials before saving
    await this.validateCredentials(normalized, current);
    
    // Save the new settings
    const updated = await this.provider.upsertSettings(normalized);
    return this.provider.toPublic(updated)!;
  }

  private async validateCredentials(
    params: ServerSettingsUpdateParams,
    current: ServerSettingsInternal | null,
  ) {
    // Check if user is trying to set credentials (providing any credential field)
    const isSettingCredentials =
      (params.awsAccessKeyId !== undefined && params.awsAccessKeyId !== null) ||
      (params.awsSecretAccessKey !== undefined && params.awsSecretAccessKey !== null) ||
      (params.awsRegion !== undefined && params.awsRegion !== null);

    // If not setting credentials, skip validation (allowing clearing)
    if (!isSettingCredentials) {
      return;
    }

    // If setting credentials, validate all required fields
    const accessKeyId = params.awsAccessKeyId ?? current?.awsAccessKeyId ?? null;
    const secretProvided = params.clearAwsSecretAccessKey ? null : params.awsSecretAccessKey;
    const secretToUse = secretProvided ?? current?.awsSecretAccessKey ?? null;
    const region = params.awsRegion ?? current?.awsRegion ?? null;

    // If user is setting credentials but not providing all required fields
    if (!accessKeyId || !secretToUse) {
      throw new Error('Both AWS access key ID and secret access key are required when setting credentials.');
    }

    if (!region) {
      throw new Error('AWS region is required when setting credentials.');
    }

    // Validate credentials with AWS
    const client = new STSClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey: secretToUse,
      },
    });

    try {
      await client.send(new GetCallerIdentityCommand({}));
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'AWS credential validation failed.';
      throw new Error(message);
    }
  }
}

