import {
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateNetworkAclEntryCommand,
  DeleteNetworkAclEntryCommand,
  EC2Client,
  IpPermission,
  ReplaceNetworkAclEntryCommand,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  type IpRange,
  type Ipv6Range,
  type PortRange,
} from '@aws-sdk/client-ec2';
import type { FirewallRule } from '@hosting/common';

import { env } from '../../config/env.js';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { FirewallSettingsProvider, type FirewallSettingsInternal } from './firewall.settings-provider.js';

const DEFAULT_IPV4_ANY = '0.0.0.0/0';
const DEFAULT_IPV6_ANY = '::/0';

type AwsProtocol = string;

const protocolMap: Record<FirewallRule['protocol'], AwsProtocol> = {
  tcp: 'tcp',
  udp: 'udp',
  icmp: 'icmp',
  all: '-1',
};

const protocolNumberMap: Record<FirewallRule['protocol'], string> = {
  tcp: '6',
  udp: '17',
  icmp: '1',
  all: '-1',
};

type NetworkAclEntryDefinition = {
  egress: boolean;
  ruleNumber: number;
  protocol: string;
  ruleAction: 'allow' | 'deny';
  cidrBlock?: string;
  ipv6CidrBlock?: string;
  portRange?: PortRange;
};

export class FirewallSyncService {
  constructor(
    private readonly settingsProvider: FirewallSettingsProvider,
    private readonly repository: { updateSyncStatus(id: string, syncStatus: FirewallRule['syncStatus'], syncError?: string | null): Promise<void> },
    private readonly serverSettingsProvider?: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {
    const defaultsSecurityGroup = env.FIREWALL_SECURITY_GROUP_ID ?? null;
    const defaultsNetworkAcl = env.FIREWALL_NETWORK_ACL_ID ?? null;

    if (!defaultsSecurityGroup && !defaultsNetworkAcl) {
      logger.info('Firewall sync will rely on stored settings (no defaults provided).');
    }
  }

  async resolveSettings(): Promise<FirewallSettingsInternal | null> {
    try {
      return await this.settingsProvider.getSettings();
    } catch (error) {
      logger.error({ err: error }, 'Failed to resolve firewall settings.');
      throw error;
    }
  }

  /**
   * Apply a rule to AWS before saving to database.
   * This ensures AWS is the source of truth - if AWS fails, we don't save to DB.
   * @param ruleInput The rule input to apply
   * @param existingRuleId Optional existing rule ID (for updates) - used to calculate consistent rule numbers
   */
  async applyRuleToAws(
    ruleInput: {
      action: FirewallRule['action'];
      direction: FirewallRule['direction'];
      protocol: FirewallRule['protocol'];
      portRange: FirewallRule['portRange'];
      source: FirewallRule['source'];
      destination: FirewallRule['destination'];
      status: FirewallRule['status'];
    },
    existingRuleId?: string,
  ): Promise<void> {
    // Skip if disabled
    if (ruleInput.status !== 'enabled') {
      return;
    }

    const settings = await this.resolveSettings();

    // If no settings configured, throw error
    if (!settings) {
      throw new Error('Firewall settings not configured. Please configure AWS credentials and infrastructure targets in server settings.');
    }

    // Check if infrastructure is configured
    const needsSecurityGroup = ruleInput.action === 'allow' && !settings.securityGroupId;
    const needsNetworkAcl = ruleInput.action === 'deny' && !settings.networkAclId;

    if (needsSecurityGroup || needsNetworkAcl) {
      throw new Error(
        needsSecurityGroup
          ? 'Security Group ID not configured. Please configure firewall settings.'
          : 'Network ACL ID not configured. Please configure firewall settings.',
      );
    }

    // Verify we can build a client (has credentials from firewall settings or server settings)
    // buildClient will throw if no credentials are available
    await this.buildClient(settings);

    // Apply to AWS - this will throw if it fails
    if (ruleInput.action === 'allow') {
      await this.applySecurityGroupRuleInput(ruleInput, 'authorize', settings);
    } else {
      // For Network ACL, we need a rule ID to calculate rule number
      // Use existing rule ID if provided (for updates), otherwise generate temp ID (for new rules)
      const ruleId = existingRuleId ?? this.generateTempRuleId(ruleInput);
      await this.applyNetworkAclRuleInput(ruleInput, ruleId, settings);
    }
  }

  /**
   * Generate a temporary rule ID for Network ACL rule number calculation
   */
  private generateTempRuleId(ruleInput: {
    action: FirewallRule['action'];
    direction: FirewallRule['direction'];
    protocol: FirewallRule['protocol'];
    portRange: FirewallRule['portRange'];
    source: FirewallRule['source'];
    destination: FirewallRule['destination'];
  }): string {
    // Create a hash from rule properties to use as temporary ID
    const hashInput = JSON.stringify({
      action: ruleInput.action,
      direction: ruleInput.direction,
      protocol: ruleInput.protocol,
      portRange: ruleInput.portRange,
      source: ruleInput.source,
      destination: ruleInput.destination,
    });
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to hex string and pad to at least 4 characters
    return Math.abs(hash).toString(16).padStart(4, '0');
  }

  /**
   * Apply Network ACL rule from input (used before saving to DB)
   */
  async applyNetworkAclRuleInput(
    ruleInput: {
      action: FirewallRule['action'];
      direction: FirewallRule['direction'];
      protocol: FirewallRule['protocol'];
      portRange: FirewallRule['portRange'];
      source: FirewallRule['source'];
      destination: FirewallRule['destination'];
    },
    tempRuleId: string,
    settings: FirewallSettingsInternal,
  ): Promise<void> {
    const networkAclId = settings.networkAclId;
    if (!networkAclId) {
      throw new Error('Network ACL ID not configured');
    }

    const client = await this.buildClient(settings);
    const entries = this.buildNetworkAclEntriesFromInput(ruleInput, tempRuleId);

    try {
      // Use CreateNetworkAclEntryCommand for new entries (before saving to DB)
      // ReplaceNetworkAclEntryCommand requires the entry to already exist
      await Promise.all(
        entries.map((entry) =>
          client.send(
            new CreateNetworkAclEntryCommand({
              NetworkAclId: networkAclId,
              RuleNumber: entry.ruleNumber,
              Protocol: entry.protocol,
              RuleAction: entry.ruleAction,
              Egress: entry.egress,
              CidrBlock: entry.cidrBlock,
              Ipv6CidrBlock: entry.ipv6CidrBlock,
              PortRange: entry.portRange,
            }),
          ),
        ),
      );
      logger.debug({ entries }, 'Network ACL rule applied to AWS successfully.');
    } catch (error) {
      const err = error as Error & { name?: string; Code?: string; message?: string };
      
      // Handle duplicate entry error gracefully (entry might already exist)
      if (err.name === 'InvalidNetworkAclEntry.Duplicate' || err.Code === 'InvalidNetworkAclEntry.Duplicate') {
        logger.debug({ entries }, 'Network ACL entry already exists in AWS.');
        return; // Entry already exists, which is fine
      }
      
      // Log the full error for debugging
      logger.error({ 
        err: error, 
        entries,
        errorName: err.name,
        errorCode: err.Code,
        errorMessage: err.message,
      }, 'Failed to apply Network ACL rule to AWS.');
      
      // Re-throw to prevent saving to DB
      throw error;
    }
  }

  async applyRuleCreated(rule: FirewallRule) {
    if (rule.status !== 'enabled') {
      try {
        await this.repository.updateSyncStatus(rule.id, 'not_applicable');
      } catch (error) {
        logger.error({ err: error, ruleId: rule.id }, 'Failed to update sync status for disabled rule.');
      }
      return;
    }

    try {
      const settings = await this.resolveSettings();

      // If no settings configured, mark as not applicable
      if (!settings) {
        try {
          await this.repository.updateSyncStatus(rule.id, 'not_applicable', 'Firewall settings not configured');
        } catch (error) {
          logger.error({ err: error, ruleId: rule.id }, 'Failed to update sync status for missing settings.');
        }
        return;
      }

      // Check if infrastructure is configured
      const needsSecurityGroup = rule.action === 'allow' && !settings.securityGroupId;
      const needsNetworkAcl = rule.action === 'deny' && !settings.networkAclId;

      if (needsSecurityGroup || needsNetworkAcl) {
        try {
          await this.repository.updateSyncStatus(
            rule.id,
            'not_applicable',
            needsSecurityGroup
              ? 'Security Group ID not configured'
              : 'Network ACL ID not configured',
          );
        } catch (error) {
          logger.error({ err: error, ruleId: rule.id }, 'Failed to update sync status for missing infrastructure.');
        }
        return;
      }

      // Validate rule ID format before building entries
      if (!rule.id || typeof rule.id !== 'string' || rule.id.length < 4) {
        const errorMessage = `Invalid rule ID format: ${rule.id}`;
        logger.error({ ruleId: rule.id, rule }, errorMessage);
        await this.repository.updateSyncStatus(rule.id, 'failed', errorMessage);
        return;
      }

      if (rule.action === 'allow') {
        await this.applySecurityGroupRule(rule, 'authorize', settings);
      } else {
        await this.applyNetworkAclRule(rule, settings);
      }

      // Sync succeeded
      try {
        await this.repository.updateSyncStatus(rule.id, 'synced', null);
      } catch (error) {
        logger.error({ err: error, ruleId: rule.id }, 'Failed to update sync status after successful sync.');
        // Don't throw - sync was successful, just status update failed
      }
    } catch (error) {
      // Log sync errors and update status
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ 
        err: error, 
        ruleId: rule.id, 
        action: rule.action,
        rule: JSON.stringify(rule),
        errorStack: error instanceof Error ? error.stack : undefined,
      }, 'Failed to sync firewall rule to AWS. Rule saved but not enforced.');
      try {
        await this.repository.updateSyncStatus(rule.id, 'failed', errorMessage);
      } catch (updateError) {
        logger.error({ err: updateError, ruleId: rule.id }, 'Failed to update sync status after sync failure.');
        // Don't re-throw - we've logged the error, rule is saved
      }
      // Don't re-throw - rule is saved, sync failure is tracked in status
    }
  }

  async applyRuleUpdated(previous: FirewallRule, next: FirewallRule) {
    const settings = await this.resolveSettings();

    // Revoke/delete previous rule
    try {
      if (previous.action === 'allow') {
        await this.applySecurityGroupRule(previous, 'revoke', settings);
      } else {
        await this.deleteNetworkAclRule(previous, settings);
      }
    } catch (error) {
      logger.warn({ err: error, ruleId: previous.id }, 'Failed to revoke previous rule during update.');
    }

    if (next.status !== 'enabled') {
      await this.repository.updateSyncStatus(next.id, 'not_applicable');
      return;
    }

    try {
      // Check if infrastructure is configured
      const needsSecurityGroup = next.action === 'allow' && !settings?.securityGroupId;
      const needsNetworkAcl = next.action === 'deny' && !settings?.networkAclId;

      if (needsSecurityGroup || needsNetworkAcl) {
        await this.repository.updateSyncStatus(
          next.id,
          'not_applicable',
          needsSecurityGroup
            ? 'Security Group ID not configured'
            : 'Network ACL ID not configured',
        );
        return;
      }

      if (next.action === 'allow') {
        await this.applySecurityGroupRule(next, 'authorize', settings);
      } else {
        await this.applyNetworkAclRule(next, settings);
      }

      // Sync succeeded
      await this.repository.updateSyncStatus(next.id, 'synced', null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, ruleId: next.id }, 'Failed to sync firewall rule to AWS.');
      await this.repository.updateSyncStatus(next.id, 'failed', errorMessage);
    }
  }

  async applyRuleDeleted(rule: FirewallRule) {
    const settings = await this.resolveSettings();

    try {
      if (rule.action === 'allow') {
        await this.applySecurityGroupRule(rule, 'revoke', settings);
      } else {
        await this.deleteNetworkAclRule(rule, settings);
      }
    } catch (error) {
      logger.warn({ err: error, ruleId: rule.id }, 'Failed to delete firewall rule from AWS.');
      // Don't throw - rule is already deleted from DB
    }
  }

  /**
   * Apply Security Group rule from input (used before saving to DB)
   */
  async applySecurityGroupRuleInput(
    ruleInput: {
      action: FirewallRule['action'];
      direction: FirewallRule['direction'];
      protocol: FirewallRule['protocol'];
      portRange: FirewallRule['portRange'];
      source: FirewallRule['source'];
      destination: FirewallRule['destination'];
    },
    mode: 'authorize' | 'revoke',
    settings: FirewallSettingsInternal,
  ): Promise<void> {
    const securityGroupId = settings.securityGroupId;
    if (!securityGroupId) {
      throw new Error('Security Group ID not configured');
    }

    const client = await this.buildClient(settings);
    const permission = this.buildIpPermissionFromInput(ruleInput);
    const params = {
      GroupId: securityGroupId,
      IpPermissions: [permission],
    };

    try {
      if (ruleInput.direction === 'ingress') {
        if (mode === 'authorize') {
          await client.send(new AuthorizeSecurityGroupIngressCommand(params));
        } else {
          await client.send(new RevokeSecurityGroupIngressCommand(params));
        }
      } else {
        if (mode === 'authorize') {
          await client.send(new AuthorizeSecurityGroupEgressCommand(params));
        } else {
          await client.send(new RevokeSecurityGroupEgressCommand(params));
        }
      }
    } catch (error) {
      const err = error as Error & { name?: string };
      if (mode === 'authorize' && err.name === 'InvalidPermission.Duplicate') {
        // Rule already exists in AWS - this is okay, we can still save to DB
        logger.debug('Security group rule already present in AWS.');
        return;
      }
      if (mode === 'revoke' && err.name === 'InvalidPermission.NotFound') {
        logger.debug('Security group rule already absent from AWS.');
        return;
      }
      logger.error({ err, action: mode, direction: ruleInput.direction }, 'Failed to apply security group rule to AWS.');
      throw err;
    }
  }

  private async applySecurityGroupRule(
    rule: FirewallRule,
    mode: 'authorize' | 'revoke',
    settings: FirewallSettingsInternal | null,
  ) {
    const securityGroupId = settings?.securityGroupId;

    if (!securityGroupId) {
      if (rule.action === 'allow') {
        logger.warn({ ruleId: rule.id }, 'Skipping security group sync: no security group configured.');
      }
      return;
    }

    const client = await this.buildClient(settings);
    const permission = this.buildIpPermission(rule);
    const params = {
      GroupId: securityGroupId,
      IpPermissions: [permission],
    };

    try {
      if (rule.direction === 'ingress') {
        if (mode === 'authorize') {
          await client.send(new AuthorizeSecurityGroupIngressCommand(params));
        } else {
          await client.send(new RevokeSecurityGroupIngressCommand(params));
        }
      } else {
        if (mode === 'authorize') {
          await client.send(new AuthorizeSecurityGroupEgressCommand(params));
        } else {
          await client.send(new RevokeSecurityGroupEgressCommand(params));
        }
      }
    } catch (error) {
      const err = error as Error & { name?: string };
      if (mode === 'authorize' && err.name === 'InvalidPermission.Duplicate') {
        logger.debug({ ruleId: rule.id }, 'Security group rule already present.');
        return;
      }
      if (mode === 'revoke' && err.name === 'InvalidPermission.NotFound') {
        logger.debug({ ruleId: rule.id }, 'Security group rule already absent.');
        return;
      }
      logger.error(
        { err, ruleId: rule.id, action: mode, direction: rule.direction },
        'Failed to synchronize security group rule.',
      );
      throw err;
    }
  }

  private async applyNetworkAclRule(rule: FirewallRule, settings: FirewallSettingsInternal | null) {
    const networkAclId = settings?.networkAclId;
    if (!networkAclId) {
      logger.warn({ ruleId: rule.id }, 'Skipping deny rule sync: no network ACL configured.');
      return;
    }

    const client = await this.buildClient(settings);
    const entries = this.buildNetworkAclEntries(rule);

    try {
      await Promise.all(
        entries.map((entry) =>
          client.send(
            new ReplaceNetworkAclEntryCommand({
              NetworkAclId: networkAclId,
              RuleNumber: entry.ruleNumber,
              Protocol: entry.protocol,
              RuleAction: entry.ruleAction,
              Egress: entry.egress,
              CidrBlock: entry.cidrBlock,
              Ipv6CidrBlock: entry.ipv6CidrBlock,
              PortRange: entry.portRange,
            }),
          ),
        ),
      );
      // ReplaceNetworkAclEntry creates the entry if it doesn't exist, so success means it's created
      logger.debug({ ruleId: rule.id, entries }, 'Network ACL rule created/updated successfully.');
    } catch (error) {
      const err = error as Error & { name?: string; Code?: string; message?: string };
      
      // Log the full error for debugging
      logger.error({ 
        err: error, 
        ruleId: rule.id, 
        entries,
        errorName: err.name,
        errorCode: err.Code,
        errorMessage: err.message,
      }, 'Failed to synchronize network ACL deny rule.');
      
      // Re-throw to mark sync as failed
      throw error;
    }
  }

  async deleteNetworkAclRule(rule: FirewallRule, settings: FirewallSettingsInternal | null) {
    const networkAclId = settings?.networkAclId;
    if (!networkAclId) {
      return;
    }

    const client = await this.buildClient(settings);
    const entries = this.buildNetworkAclEntries(rule);

    try {
      await Promise.all(
        entries.map((entry) =>
          client.send(
            new DeleteNetworkAclEntryCommand({
              NetworkAclId: networkAclId,
              RuleNumber: entry.ruleNumber,
              Egress: entry.egress,
            }),
          ),
        ),
      );
    } catch (error) {
      const err = error as Error & { name?: string };
      if (err.name === 'InvalidNetworkAclEntry.NotFound') {
        logger.debug({ ruleId: rule.id }, 'Network ACL entry already absent.');
        return;
      }
      logger.error({ err, ruleId: rule.id }, 'Failed to delete network ACL rule.');
      throw err;
    }
  }

  /**
   * Build IP permission from rule input (used before saving to DB)
   */
  private buildIpPermissionFromInput(ruleInput: {
    direction: FirewallRule['direction'];
    protocol: FirewallRule['protocol'];
    portRange: FirewallRule['portRange'];
    source: FirewallRule['source'];
    destination: FirewallRule['destination'];
  }): IpPermission {
    const permission: IpPermission = {
      IpProtocol: protocolMap[ruleInput.protocol],
      IpRanges: [],
      Ipv6Ranges: [],
    };

    if (ruleInput.protocol !== 'all') {
      const from = ruleInput.portRange ? ruleInput.portRange.from : 0;
      const to = ruleInput.portRange ? ruleInput.portRange.to : 65535;
      permission.FromPort = from;
      permission.ToPort = to;
    }

    const targetAddress = ruleInput.direction === 'ingress' ? ruleInput.source : ruleInput.destination;
    const { ipRanges, ipv6Ranges } = this.buildTargetRanges(targetAddress, 'Firewall rule');

    permission.IpRanges = ipRanges;
    permission.Ipv6Ranges = ipv6Ranges;

    return permission;
  }

  private buildIpPermission(rule: FirewallRule): IpPermission {
    const permission: IpPermission = {
      IpProtocol: protocolMap[rule.protocol],
      IpRanges: [],
      Ipv6Ranges: [],
    };

    if (rule.protocol !== 'all') {
      const from = rule.portRange ? rule.portRange.from : 0;
      const to = rule.portRange ? rule.portRange.to : 65535;
      permission.FromPort = from;
      permission.ToPort = to;
    }

    const targetAddress = rule.direction === 'ingress' ? rule.source : rule.destination;
    const { ipRanges, ipv6Ranges } = this.buildTargetRanges(targetAddress, rule.name);

    permission.IpRanges = ipRanges;
    permission.Ipv6Ranges = ipv6Ranges;

    return permission;
  }

  private buildTargetRanges(address: string | null, description: string): {
    ipRanges: IpRange[];
    ipv6Ranges: Ipv6Range[];
  } {
    const ipRanges: IpRange[] = [];
    const ipv6Ranges: Ipv6Range[] = [];

    if (!address) {
      ipRanges.push({ CidrIp: DEFAULT_IPV4_ANY, Description: description });
      ipv6Ranges.push({ CidrIpv6: DEFAULT_IPV6_ANY, Description: description });
      return { ipRanges, ipv6Ranges };
    }

    if (address.includes(':')) {
      ipv6Ranges.push({ CidrIpv6: address, Description: description });
    } else {
      ipRanges.push({ CidrIp: address, Description: description });
    }

    return { ipRanges, ipv6Ranges };
  }

  /**
   * Build Network ACL entries from rule input (used before saving to DB)
   * Uses a temporary rule number that will be recalculated when saved
   */
  private buildNetworkAclEntriesFromInput(
    ruleInput: {
      action: FirewallRule['action'];
      direction: FirewallRule['direction'];
      protocol: FirewallRule['protocol'];
      portRange: FirewallRule['portRange'];
      source: FirewallRule['source'];
      destination: FirewallRule['destination'];
    },
    tempRuleId: string,
  ): NetworkAclEntryDefinition[] {
    const targetAddress = ruleInput.direction === 'ingress' ? ruleInput.source : ruleInput.destination;
    const targets = this.normalizeTargets(targetAddress);

    return targets.map((target) => ({
      egress: ruleInput.direction === 'egress',
      ruleNumber: this.calculateRuleNumber(tempRuleId, ruleInput.direction, target.kind),
      protocol: protocolNumberMap[ruleInput.protocol],
      ruleAction: ruleInput.action === 'allow' ? 'allow' : 'deny',
      cidrBlock: target.kind === 'ipv4' ? target.value : undefined,
      ipv6CidrBlock: target.kind === 'ipv6' ? target.value : undefined,
      portRange: this.buildPortRangeFromInput(ruleInput),
    }));
  }

  private buildNetworkAclEntries(rule: FirewallRule): NetworkAclEntryDefinition[] {
    const targetAddress = rule.direction === 'ingress' ? rule.source : rule.destination;
    const targets = this.normalizeTargets(targetAddress);

    return targets.map((target) => ({
      egress: rule.direction === 'egress',
      ruleNumber: this.calculateRuleNumber(rule.id, rule.direction, target.kind),
      protocol: protocolNumberMap[rule.protocol],
      ruleAction: rule.action === 'allow' ? 'allow' : 'deny',
      cidrBlock: target.kind === 'ipv4' ? target.value : undefined,
      ipv6CidrBlock: target.kind === 'ipv6' ? target.value : undefined,
      portRange: this.buildPortRange(rule),
    }));
  }

  private normalizeTargets(address: string | null): Array<{ value: string; kind: 'ipv4' | 'ipv6' }> {
    if (!address) {
      return [
        { value: DEFAULT_IPV4_ANY, kind: 'ipv4' },
        { value: DEFAULT_IPV6_ANY, kind: 'ipv6' },
      ];
    }

    // AWS Network ACLs require CIDR notation
    // Convert single IP addresses to CIDR format
    if (address.includes(':')) {
      // IPv6: convert single IP to /128 if not already CIDR
      const normalized = address.includes('/') ? address : `${address}/128`;
      return [{ value: normalized, kind: 'ipv6' }];
    }

    // IPv4: convert single IP to /32 if not already CIDR
    const normalized = address.includes('/') ? address : `${address}/32`;
    return [{ value: normalized, kind: 'ipv4' }];
  }

  private calculateRuleNumber(id: string, direction: FirewallRule['direction'], targetKind: 'ipv4' | 'ipv6') {
    const base = parseInt(id.slice(-4), 16);
    const normalized = (Number.isNaN(base) ? 0 : base) % 15000;
    const offset = direction === 'ingress' ? 100 : 17000;
    const kindOffset = targetKind === 'ipv6' ? 500 : 0;
    return offset + normalized + kindOffset;
  }

  private buildPortRangeFromInput(ruleInput: {
    protocol: FirewallRule['protocol'];
    portRange: FirewallRule['portRange'];
  }): PortRange | undefined {
    if (ruleInput.protocol === 'all' || ruleInput.protocol === 'icmp') {
      return undefined;
    }

    const range = ruleInput.portRange ?? { from: 0, to: 65535 };

    return {
      From: range.from,
      To: range.to,
    };
  }

  private buildPortRange(rule: FirewallRule): PortRange | undefined {
    if (rule.protocol === 'all' || rule.protocol === 'icmp') {
      return undefined;
    }

    const range = rule.portRange ?? { from: 0, to: 65535 };

    return {
      From: range.from,
      To: range.to,
    };
  }

  private async buildClient(settings: FirewallSettingsInternal | null): Promise<EC2Client> {
    // Try firewall settings credentials first
    if (settings?.awsAccessKeyId && settings.awsSecretAccessKey) {
      // Get region from server settings (firewall settings don't store region)
      let region = env.AWS_REGION;
      if (this.serverSettingsProvider) {
        try {
          const serverSettings = await this.serverSettingsProvider.getSettings();
          if (serverSettings?.awsRegion) {
            region = serverSettings.awsRegion;
          }
        } catch (error) {
          logger.debug({ err: error }, 'Failed to get region from server settings, using default.');
        }
      }
      if (!region) {
        throw new Error('AWS region is required. Configure it in server settings.');
      }
      return new EC2Client({
        region,
        credentials: {
          accessKeyId: settings.awsAccessKeyId,
          secretAccessKey: settings.awsSecretAccessKey,
        },
      });
    }

    // Fallback to server settings credentials
    if (this.serverSettingsProvider) {
      try {
        const serverSettings = await this.serverSettingsProvider.getSettings();
        if (serverSettings?.awsAccessKeyId && serverSettings?.awsSecretAccessKey) {
          const region = serverSettings.awsRegion ?? env.AWS_REGION;
          if (!region) {
            throw new Error('AWS region is required. Configure it in server settings.');
          }
          return new EC2Client({
            region,
            credentials: {
              accessKeyId: serverSettings.awsAccessKeyId,
              secretAccessKey: serverSettings.awsSecretAccessKey,
            },
          });
        }
      } catch (error) {
        logger.debug({ err: error }, 'Failed to get server settings for firewall sync fallback.');
      }
    }

    // Final fallback to default credential chain
    const region = env.AWS_REGION;
    if (!region) {
      throw new Error('AWS region is required. Configure it in server settings.');
    }
    return new EC2Client({ region });
  }
}

