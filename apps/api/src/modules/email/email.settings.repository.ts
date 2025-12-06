export interface EmailSettingsRecord {
  panicModeEnabled: boolean;
  updatedAt: Date | null;
}

export interface EmailSettingsUpdateInput {
  panicModeEnabled?: boolean;
}

export interface EmailSettingsRepository {
  getSettings(): Promise<EmailSettingsRecord | null>;
  upsertSettings(input: EmailSettingsUpdateInput): Promise<EmailSettingsRecord>;
}



