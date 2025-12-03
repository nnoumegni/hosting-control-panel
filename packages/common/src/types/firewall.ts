export type FirewallRuleDirection = 'ingress' | 'egress';

export type FirewallRuleProtocol = 'tcp' | 'udp' | 'icmp' | 'all';

export type FirewallRuleStatus = 'enabled' | 'disabled';

export type FirewallRuleAction = 'allow' | 'deny';

export type FirewallRuleSyncStatus = 'synced' | 'pending' | 'failed' | 'not_applicable';

export interface FirewallSettings {
  securityGroupId: string | null;
  networkAclId: string | null;
  awsAccessKeyId: string | null;
  hasAwsSecretAccessKey: boolean;
  updatedAt: string | null;
}

export interface FirewallPortRange {
  from: number;
  to: number;
}

export interface FirewallRule {
  id: string;
  name: string;
  description?: string;
  direction: FirewallRuleDirection;
  protocol: FirewallRuleProtocol;
  portRange: FirewallPortRange | null;
  source: string | null;
  destination: string | null;
  action: FirewallRuleAction;
  status: FirewallRuleStatus;
  syncStatus: FirewallRuleSyncStatus;
  lastSyncAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

