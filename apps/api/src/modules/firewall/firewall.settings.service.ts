import type { FirewallSettings } from '@hosting/common';

import {
  type FirewallSettingsInternal,
  FirewallSettingsProvider,
  type FirewallSettingsUpdateParams,
} from './firewall.settings-provider.js';

export class FirewallSettingsService {
  constructor(private readonly provider: FirewallSettingsProvider) {}

  async getSettings(): Promise<FirewallSettings | null> {
    const settings = await this.provider.getSettings();
    return this.toPublic(settings);
  }

  async updateSettings(input: FirewallSettingsUpdateParams): Promise<FirewallSettings> {
    const updated = await this.provider.upsertSettings(input);
    return this.toPublic(updated)!;
  }

  private toPublic(settings: FirewallSettingsInternal | null): FirewallSettings | null {
    if (!settings) {
      return null;
    }
    return {
      securityGroupId: settings.securityGroupId,
      networkAclId: settings.networkAclId,
      awsAccessKeyId: settings.awsAccessKeyId,
      hasAwsSecretAccessKey: Boolean(settings.awsSecretAccessKey),
      updatedAt: settings.updatedAt,
    };
  }
}

