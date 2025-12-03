import type { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import type { GatewayAISettingsProvider } from './gateway-ai-settings-provider.js';

export class GatewayService {
  constructor(
    private readonly serverSettingsProvider: ServerSettingsProvider,
    private readonly aiSettingsProvider: GatewayAISettingsProvider,
  ) {}

  async getServerSettings() {
    return this.serverSettingsProvider.getSettings();
  }

  async getAISettings() {
    return this.aiSettingsProvider.getSettings();
  }

  async updateAISettings(params: Parameters<GatewayAISettingsProvider['upsertSettings']>[0]) {
    return this.aiSettingsProvider.upsertSettings(params);
  }
}
