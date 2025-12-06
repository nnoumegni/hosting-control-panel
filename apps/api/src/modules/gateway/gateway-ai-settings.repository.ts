export interface GatewayAISettingsRecord {
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
  model: string | null;
  refreshSeconds: number | null;
  temperature: number | null;
  maxTokens: number | null;
  updatedAt: Date | null;
}

export interface GatewayAISettingsUpdateInput {
  baseUrl?: string | null;
  apiKeyEncrypted?: string | null;
  model?: string | null;
  refreshSeconds?: number | null;
  temperature?: number | null;
  maxTokens?: number | null;
}

export interface GatewayAISettingsRepository {
  getSettings(): Promise<GatewayAISettingsRecord | null>;
  upsertSettings(input: GatewayAISettingsUpdateInput): Promise<GatewayAISettingsRecord>;
}








