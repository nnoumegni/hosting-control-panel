export interface ServerSettingsRecord {
  name: string | null;
  awsRegion: string | null;
  awsAccessKeyIdEncrypted: string | null;
  awsSecretAccessKeyEncrypted: string | null;
  updatedAt: Date | null;
}

export interface ServerSettingsUpdateInput {
  name?: string | null;
  awsRegion?: string | null;
  awsAccessKeyIdEncrypted?: string | null;
  awsSecretAccessKeyEncrypted?: string | null;
}

export interface ServerSettingsRepository {
  getSettings(): Promise<ServerSettingsRecord | null>;
  upsertSettings(input: ServerSettingsUpdateInput): Promise<ServerSettingsRecord>;
}


