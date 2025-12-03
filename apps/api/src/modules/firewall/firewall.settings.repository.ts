export interface FirewallSettingsRecord {
  securityGroupId: string | null;
  networkAclId: string | null;
  awsAccessKeyIdEncrypted: string | null;
  awsSecretAccessKeyEncrypted: string | null;
  updatedAt: Date | null;
}

export interface FirewallSettingsUpdateInput {
  securityGroupId?: string | null;
  networkAclId?: string | null;
  awsAccessKeyIdEncrypted?: string | null;
  awsSecretAccessKeyEncrypted?: string | null;
}

export interface FirewallSettingsRepository {
  getSettings(): Promise<FirewallSettingsRecord | null>;
  upsertSettings(input: FirewallSettingsUpdateInput): Promise<FirewallSettingsRecord>;
}

