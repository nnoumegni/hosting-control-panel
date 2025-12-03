import type { FirewallRule } from '@hosting/common';

export interface CreateFirewallRuleInput {
  name: string;
  description?: string;
  direction: FirewallRule['direction'];
  protocol: FirewallRule['protocol'];
  portRange?: FirewallRule['portRange'] | null;
  source?: FirewallRule['source'];
  destination?: FirewallRule['destination'];
  action?: FirewallRule['action'];
  status?: FirewallRule['status'];
}

export interface UpdateFirewallRuleInput {
  name?: string;
  description?: string;
  direction?: FirewallRule['direction'];
  protocol?: FirewallRule['protocol'];
  portRange?: FirewallRule['portRange'] | null;
  source?: FirewallRule['source'];
  destination?: FirewallRule['destination'];
  action?: FirewallRule['action'];
  status?: FirewallRule['status'];
}

export interface FirewallRepository {
  listRules(): Promise<FirewallRule[]>;
  getRuleById(id: string): Promise<FirewallRule | null>;
  createRule(input: CreateFirewallRuleInput): Promise<FirewallRule>;
  updateRule(id: string, input: UpdateFirewallRuleInput): Promise<FirewallRule | null>;
  updateSyncStatus(id: string, syncStatus: FirewallRule['syncStatus'], syncError?: string | null): Promise<void>;
  deleteRule(id: string): Promise<boolean>;
}

