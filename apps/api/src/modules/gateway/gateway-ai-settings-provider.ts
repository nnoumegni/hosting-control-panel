import { logger } from '../../core/logger/index.js';
import { decryptSecret, encryptSecret } from '@hosting/common';
import type {
  GatewayAISettingsRecord,
  GatewayAISettingsRepository,
  GatewayAISettingsUpdateInput,
} from './gateway-ai-settings.repository.js';

export interface GatewayAISettingsInternal {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  refreshSeconds: number | null;
  temperature: number | null;
  maxTokens: number | null;
  updatedAt: string | null;
}

export interface GatewayAISettingsUpdateParams {
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  refreshSeconds?: number | null;
  temperature?: number | null;
  maxTokens?: number | null;
  clearApiKey?: boolean;
}

export class GatewayAISettingsProvider {
  private cache: GatewayAISettingsInternal | null | undefined;

  constructor(
    private readonly repository: GatewayAISettingsRepository,
    private readonly credentialPassphrase?: string | null,
  ) {}

  async getSettings(): Promise<GatewayAISettingsInternal | null> {
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

  async upsertSettings(params: GatewayAISettingsUpdateParams): Promise<GatewayAISettingsInternal> {
    const update: GatewayAISettingsUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(params, 'baseUrl')) {
      update.baseUrl = params.baseUrl ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'model')) {
      update.model = params.model ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'refreshSeconds')) {
      update.refreshSeconds = params.refreshSeconds ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'temperature')) {
      update.temperature = params.temperature ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'maxTokens')) {
      update.maxTokens = params.maxTokens ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(params, 'apiKey')) {
      if (params.clearApiKey || (params.apiKey == null || params.apiKey === '')) {
        update.apiKeyEncrypted = null;
      } else {
        update.apiKeyEncrypted = encryptSecret(
          params.apiKey,
          this.requirePassphrase('API key'),
        );
      }
    }

    const record = await this.repository.upsertSettings(update);
    const internal = this.toInternal(record);
    this.cache = internal;
    return internal;
  }

  clearCache(): void {
    this.cache = undefined;
  }

  private toInternal(record: GatewayAISettingsRecord): GatewayAISettingsInternal {
    let apiKey: string | null = null;
    if (record.apiKeyEncrypted) {
      try {
        apiKey = decryptSecret(record.apiKeyEncrypted, this.requirePassphrase('API key'));
      } catch (error) {
        logger.error({ err: error }, 'Failed to decrypt API key');
        apiKey = null;
      }
    }

    return {
      baseUrl: record.baseUrl ?? null,
      apiKey,
      model: record.model ?? null,
      refreshSeconds: record.refreshSeconds ?? null,
      temperature: record.temperature ?? null,
      maxTokens: record.maxTokens ?? null,
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
    };
  }

  private requirePassphrase(secretName: string): string {
    if (!this.credentialPassphrase) {
      throw new Error(
        `Credential passphrase is required to encrypt/decrypt ${secretName}. Set FIREWALL_CREDENTIAL_PASSPHRASE environment variable.`,
      );
    }
    return this.credentialPassphrase;
  }
}
