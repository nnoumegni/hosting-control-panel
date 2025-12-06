import type { EmailSettingsRepository } from './email.settings.repository.js';

export interface EmailSettings {
  panicModeEnabled: boolean;
  updatedAt: string | null;
}

export interface EmailSettingsUpdateParams {
  panicModeEnabled?: boolean;
}

export class EmailSettingsService {
  constructor(private readonly repository: EmailSettingsRepository) {}

  async getSettings(): Promise<EmailSettings> {
    const record = await this.repository.getSettings();
    if (!record) {
      // Return default settings
      return {
        panicModeEnabled: false,
        updatedAt: null,
      };
    }
    return {
      panicModeEnabled: record.panicModeEnabled,
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
    };
  }

  async updateSettings(input: EmailSettingsUpdateParams): Promise<EmailSettings> {
    const record = await this.repository.upsertSettings(input);
    return {
      panicModeEnabled: record.panicModeEnabled,
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
    };
  }
}



