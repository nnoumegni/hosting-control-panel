import {
  DeleteNetworkAclEntryCommand,
  DescribeNetworkAclsCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
  type IpPermission,
} from '@aws-sdk/client-ec2';
import type { FirewallRule } from '@hosting/common';

import { env } from '../../config/env.js';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import type { FirewallRepository } from './firewall.repository.js';
import { FirewallSettingsProvider, type FirewallSettingsInternal } from './firewall.settings-provider.js';

interface AwsSecurityGroupRule {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  ipRanges: string[];
  ipv6Ranges: string[];
  direction: 'ingress' | 'egress';
}

interface AwsNetworkAclRule {
  ruleNumber: number;
  protocol: string;
  ruleAction: 'allow' | 'deny';
  egress: boolean;
  cidrBlock?: string;
  ipv6CidrBlock?: string;
  portRange?: { from?: number; to?: number };
}

export class FirewallVerificationService {
  constructor(
    private readonly repository: FirewallRepository,
    private readonly settingsProvider: FirewallSettingsProvider,
    private readonly serverSettingsProvider?: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  async getAwsRules(): Promise<{
    securityGroupRules: AwsSecurityGroupRule[];
    networkAclRules: AwsNetworkAclRule[];
  }> {
    const settings = await this.settingsProvider.getSettings();

    if (!settings) {
      throw new Error('Firewall settings not configured');
    }

    const securityGroupRules: AwsSecurityGroupRule[] = [];
    const networkAclRules: AwsNetworkAclRule[] = [];

    if (settings.securityGroupId) {
      try {
        const rules = await this.getSecurityGroupRules(settings, settings.securityGroupId);
        securityGroupRules.push(...rules);
      } catch (error) {
        logger.error({ err: error, securityGroupId: settings.securityGroupId }, 'Failed to get Security Group rules');
        throw error;
      }
    }

    if (settings.networkAclId) {
      try {
        const rules = await this.getNetworkAclRules(settings, settings.networkAclId);
        networkAclRules.push(...rules);
      } catch (error) {
        logger.error({ err: error, networkAclId: settings.networkAclId }, 'Failed to get Network ACL rules');
        throw error;
      }
    }

    return { securityGroupRules, networkAclRules };
  }

  async verifyAllRules(): Promise<{ verified: number; updated: number; errors: number; errorMessages: string[]; totalRules: number }> {
    let verified = 0;
    let updated = 0;
    let errors = 0;
    const errorMessages: string[] = [];
    let totalRules = 0;

    try {
      const rules = await this.repository.listRules();
      totalRules = rules.length;
      const settings = await this.settingsProvider.getSettings();

      if (!settings) {
        const errorMsg = 'Firewall settings not configured. Configure AWS credentials and infrastructure targets in server settings.';
        logger.warn(errorMsg);
        errorMessages.push(errorMsg);
        // Update all pending rules to not_applicable if settings aren't configured
        for (const rule of rules) {
          if (rule.syncStatus === 'pending') {
            try {
              await this.repository.updateSyncStatus(rule.id, 'not_applicable', errorMsg);
              updated++;
            } catch (updateError) {
              logger.error({ err: updateError, ruleId: rule.id }, 'Failed to update sync status.');
            }
          }
        }
        return { verified: 0, updated, errors: 0, errorMessages, totalRules };
      }

      // Get AWS rules - if this fails, we'll still try to update pending rules
      let awsSecurityGroupRules: AwsSecurityGroupRule[] = [];
      let awsNetworkAclRules: AwsNetworkAclRule[] = [];
      let awsQueryFailed = false;
      let awsQueryError: string | null = null;

      try {
        if (settings.securityGroupId) {
          try {
            awsSecurityGroupRules = await this.getSecurityGroupRules(settings, settings.securityGroupId);
          } catch (error) {
            const errorMsg = `Failed to query Security Group ${settings.securityGroupId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            logger.error({ err: error, securityGroupId: settings.securityGroupId }, errorMsg);
            errorMessages.push(errorMsg);
            awsQueryFailed = true;
            awsQueryError = errorMsg;
          }
        }
        if (settings.networkAclId) {
          try {
            awsNetworkAclRules = await this.getNetworkAclRules(settings, settings.networkAclId);
          } catch (error) {
            const errorMsg = `Failed to query Network ACL ${settings.networkAclId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            logger.error({ err: error, networkAclId: settings.networkAclId }, errorMsg);
            errorMessages.push(errorMsg);
            awsQueryFailed = true;
            if (!awsQueryError) {
              awsQueryError = errorMsg;
            }
          }
        }
      } catch (error) {
        const errorMsg = `Failed to query AWS resources: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error({ err: error }, errorMsg);
        errorMessages.push(errorMsg);
        awsQueryFailed = true;
        if (!awsQueryError) {
          awsQueryError = errorMsg;
        }
        errors++;
      }

      // Verify each database rule
      for (const rule of rules) {
        try {
          // If AWS query failed, mark pending rules as failed
          if (awsQueryFailed) {
            if (rule.syncStatus === 'pending') {
              const errorMsg = awsQueryError || 'Unable to verify: AWS query failed. Check credentials and configuration.';
              await this.repository.updateSyncStatus(rule.id, 'failed', errorMsg);
              verified++;
              updated++;
            }
            continue;
          }

          const wasUpdated = await this.verifyRule(rule, settings, awsSecurityGroupRules, awsNetworkAclRules);
          verified++;
          if (wasUpdated) {
            updated++;
          }
        } catch (error) {
          errors++;
          const errorMsg = `Failed to verify rule "${rule.name}": ${error instanceof Error ? error.message : 'Unknown error'}`;
          logger.error({ err: error, ruleId: rule.id }, errorMsg);
          errorMessages.push(errorMsg);
          // Try to update status to failed if verification throws, especially for pending rules
          try {
            if (rule.syncStatus === 'pending') {
              await this.repository.updateSyncStatus(rule.id, 'failed', error instanceof Error ? error.message : 'Verification error');
              updated++;
            }
          } catch (updateError) {
            logger.error({ err: updateError, ruleId: rule.id }, 'Failed to update sync status after verification error.');
          }
        }
      }

      logger.info({ verified, updated, errors, errorCount: errorMessages.length, totalRules }, 'Firewall rules verification completed.');
    } catch (error) {
      const errorMsg = `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error({ err: error }, errorMsg);
      errorMessages.push(errorMsg);
      errors++;
      // If we failed before getting rules, try to get the count
      if (totalRules === 0) {
        try {
          const rules = await this.repository.listRules();
          totalRules = rules.length;
        } catch {
          // Ignore - totalRules stays 0
        }
      }
    }

    return { verified, updated, errors, errorMessages, totalRules };
  }

  private async verifyRule(
    rule: FirewallRule,
    settings: FirewallSettingsInternal,
    awsSecurityGroupRules: AwsSecurityGroupRule[],
    awsNetworkAclRules: AwsNetworkAclRule[],
  ): Promise<boolean> {
    // Skip disabled rules
    if (rule.status !== 'enabled') {
      if (rule.syncStatus !== 'not_applicable') {
        await this.repository.updateSyncStatus(rule.id, 'not_applicable', null);
        return true;
      }
      return false;
    }

    // Check if infrastructure is configured
    const needsSecurityGroup = rule.action === 'allow' && !settings.securityGroupId;
    const needsNetworkAcl = rule.action === 'deny' && !settings.networkAclId;

    if (needsSecurityGroup || needsNetworkAcl) {
      const error = needsSecurityGroup
        ? 'Security Group ID not configured'
        : 'Network ACL ID not configured';
      if (rule.syncStatus !== 'not_applicable' || rule.syncError !== error) {
        await this.repository.updateSyncStatus(rule.id, 'not_applicable', error);
        return true;
      }
      return false;
    }

    // Verify allow rules (Security Groups)
    if (rule.action === 'allow') {
      const isPresent = this.isSecurityGroupRulePresent(rule, awsSecurityGroupRules);
      // Update from pending/failed to synced if rule is present
      if (isPresent && rule.syncStatus !== 'synced') {
        await this.repository.updateSyncStatus(rule.id, 'synced', null);
        return true;
      }
      // Update from synced to failed if rule is not present
      if (!isPresent && rule.syncStatus === 'synced') {
        await this.repository.updateSyncStatus(rule.id, 'failed', 'Rule not found in AWS Security Group');
        return true;
      }
      // Update from pending to failed if rule is not present and we've verified it's missing
      if (!isPresent && rule.syncStatus === 'pending') {
        await this.repository.updateSyncStatus(rule.id, 'failed', 'Rule not found in AWS Security Group');
        return true;
      }
      return false;
    }

    // Verify deny rules (Network ACLs)
    if (rule.action === 'deny') {
      const isPresent = this.isNetworkAclRulePresent(rule, awsNetworkAclRules);
      // Update from pending/failed to synced if rule is present
      if (isPresent && rule.syncStatus !== 'synced') {
        await this.repository.updateSyncStatus(rule.id, 'synced', null);
        return true;
      }
      // Update from synced to failed if rule is not present
      if (!isPresent && rule.syncStatus === 'synced') {
        await this.repository.updateSyncStatus(rule.id, 'failed', 'Rule not found in AWS Network ACL');
        return true;
      }
      // Update from pending to failed if rule is not present and we've verified it's missing
      if (!isPresent && rule.syncStatus === 'pending') {
        await this.repository.updateSyncStatus(rule.id, 'failed', 'Rule not found in AWS Network ACL');
        return true;
      }
      return false;
    }

    return false;
  }

  private async getSecurityGroupRules(
    settings: FirewallSettingsInternal,
    securityGroupId: string,
  ): Promise<AwsSecurityGroupRule[]> {
    const client = await this.buildClient(settings);
    const rules: AwsSecurityGroupRule[] = [];

    try {
      const response = await client.send(
        new DescribeSecurityGroupsCommand({
          GroupIds: [securityGroupId],
        }),
      );

      const securityGroup = response.SecurityGroups?.[0];
      if (!securityGroup) {
        return rules;
      }

      // Process ingress rules
      for (const permission of securityGroup.IpPermissions || []) {
        const rule = this.parseIpPermission(permission, 'ingress');
        if (rule) {
          rules.push(rule);
        }
      }

      // Process egress rules
      for (const permission of securityGroup.IpPermissionsEgress || []) {
        const rule = this.parseIpPermission(permission, 'egress');
        if (rule) {
          rules.push(rule);
        }
      }
    } catch (error) {
      const err = error as Error & { name?: string; code?: string };
      let errorMessage = `Failed to query Security Group ${securityGroupId}`;
      
      if (err.name === 'UnauthorizedOperation' || err.code === 'UnauthorizedOperation') {
        errorMessage += ': Insufficient AWS permissions. The credentials need ec2:DescribeSecurityGroups permission.';
      } else if (err.name === 'InvalidGroup.NotFound' || err.code === 'InvalidGroup.NotFound') {
        errorMessage += `: Security Group ${securityGroupId} not found. Check if the ID is correct and exists in the configured region.`;
      } else if (err.message) {
        errorMessage += `: ${err.message}`;
      } else {
        errorMessage += ': Unknown error occurred.';
      }
      
      logger.error({ err: error, securityGroupId }, errorMessage);
      throw new Error(errorMessage);
    }

    return rules;
  }

  private async getNetworkAclRules(
    settings: FirewallSettingsInternal,
    networkAclId: string,
  ): Promise<AwsNetworkAclRule[]> {
    const client = await this.buildClient(settings);
    const rules: AwsNetworkAclRule[] = [];

    try {
      const response = await client.send(
        new DescribeNetworkAclsCommand({
          NetworkAclIds: [networkAclId],
        }),
      );

      const networkAcl = response.NetworkAcls?.[0];
      if (!networkAcl) {
        return rules;
      }

      for (const entry of networkAcl.Entries || []) {
        if (entry.RuleNumber === undefined || entry.RuleNumber === 32767) {
          // Skip default rule
          continue;
        }

        rules.push({
          ruleNumber: entry.RuleNumber,
          protocol: entry.Protocol ?? '',
          ruleAction: (entry.RuleAction as 'allow' | 'deny') ?? 'deny',
          egress: entry.Egress ?? false,
          cidrBlock: entry.CidrBlock ?? undefined,
          ipv6CidrBlock: entry.Ipv6CidrBlock ?? undefined,
          portRange:
            entry.PortRange?.From !== undefined || entry.PortRange?.To !== undefined
              ? {
                  from: entry.PortRange?.From,
                  to: entry.PortRange?.To,
                }
              : undefined,
        });
      }
    } catch (error) {
      const err = error as Error & { name?: string; code?: string };
      let errorMessage = `Failed to query Network ACL ${networkAclId}`;
      
      if (err.name === 'UnauthorizedOperation' || err.code === 'UnauthorizedOperation') {
        errorMessage += ': Insufficient AWS permissions. The credentials need ec2:DescribeNetworkAcls permission.';
      } else if (err.name === 'InvalidNetworkAclID.NotFound' || err.code === 'InvalidNetworkAclID.NotFound') {
        errorMessage += `: Network ACL ${networkAclId} not found. Check if the ID is correct and exists in the configured region.`;
      } else if (err.message) {
        errorMessage += `: ${err.message}`;
      } else {
        errorMessage += ': Unknown error occurred.';
      }
      
      logger.error({ err: error, networkAclId }, errorMessage);
      throw new Error(errorMessage);
    }

    return rules;
  }

  private parseIpPermission(permission: IpPermission, direction: 'ingress' | 'egress'): AwsSecurityGroupRule | null {
    if (!permission.IpProtocol || permission.IpProtocol === '-1') {
      // All traffic
      return {
        protocol: 'all',
        ipRanges: permission.IpRanges?.map((r) => r.CidrIp ?? '').filter(Boolean) ?? [],
        ipv6Ranges: permission.Ipv6Ranges?.map((r) => r.CidrIpv6 ?? '').filter(Boolean) ?? [],
        direction,
      };
    }

    return {
      protocol: permission.IpProtocol,
      fromPort: permission.FromPort,
      toPort: permission.ToPort,
      ipRanges: permission.IpRanges?.map((r) => r.CidrIp ?? '').filter(Boolean) ?? [],
      ipv6Ranges: permission.Ipv6Ranges?.map((r) => r.CidrIpv6 ?? '').filter(Boolean) ?? [],
      direction,
    };
  }

  private isSecurityGroupRulePresent(rule: FirewallRule, awsRules: AwsSecurityGroupRule[]): boolean {
    const protocolMap: Record<FirewallRule['protocol'], string> = {
      tcp: 'tcp',
      udp: 'udp',
      icmp: 'icmp',
      all: '-1',
    };

    const targetAddress = rule.direction === 'ingress' ? rule.source : rule.destination;
    const expectedProtocol = protocolMap[rule.protocol];
    const expectedFromPort = rule.portRange?.from;
    const expectedToPort = rule.portRange?.to;

    // Normalize target address
    const expectedAddresses: string[] = [];
    if (!targetAddress) {
      expectedAddresses.push('0.0.0.0/0', '::/0');
    } else if (targetAddress.includes(':')) {
      expectedAddresses.push(targetAddress);
    } else {
      expectedAddresses.push(targetAddress);
    }

    return awsRules.some((awsRule) => {
      // Check direction
      if (awsRule.direction !== rule.direction) {
        return false;
      }

      // Check protocol
      if (awsRule.protocol !== expectedProtocol && awsRule.protocol !== '-1') {
        return false;
      }

      // Check port range
      if (rule.protocol !== 'all' && rule.protocol !== 'icmp') {
        if (awsRule.fromPort !== expectedFromPort || awsRule.toPort !== expectedToPort) {
          return false;
        }
      }

      // Check IP ranges
      const hasMatchingIp = expectedAddresses.some((expectedAddr) => {
        if (expectedAddr.includes(':')) {
          return awsRule.ipv6Ranges.includes(expectedAddr);
        }
        return awsRule.ipRanges.includes(expectedAddr);
      });

      return hasMatchingIp;
    });
  }

  private isNetworkAclRulePresent(rule: FirewallRule, awsRules: AwsNetworkAclRule[]): boolean {
    const protocolNumberMap: Record<FirewallRule['protocol'], string> = {
      tcp: '6',
      udp: '17',
      icmp: '1',
      all: '-1',
    };

    const targetAddress = rule.direction === 'ingress' ? rule.source : rule.destination;
    const expectedProtocol = protocolNumberMap[rule.protocol];
    const expectedEgress = rule.direction === 'egress';
    const expectedAction = rule.action;

    // Normalize target address to match what was sent to AWS (CIDR format)
    const expectedAddresses: string[] = [];
    if (!targetAddress) {
      expectedAddresses.push('0.0.0.0/0', '::/0');
    } else if (targetAddress.includes(':')) {
      // IPv6: convert single IP to /128 if not already CIDR
      const normalized = targetAddress.includes('/') ? targetAddress : `${targetAddress}/128`;
      expectedAddresses.push(normalized);
    } else {
      // IPv4: convert single IP to /32 if not already CIDR
      const normalized = targetAddress.includes('/') ? targetAddress : `${targetAddress}/32`;
      expectedAddresses.push(normalized);
    }

    return awsRules.some((awsRule) => {
      // Check egress/ingress
      if (awsRule.egress !== expectedEgress) {
        return false;
      }

      // Check protocol
      if (awsRule.protocol !== expectedProtocol && awsRule.protocol !== '-1') {
        return false;
      }

      // Check action
      if (awsRule.ruleAction !== expectedAction) {
        return false;
      }

      // Check IP ranges
      const hasMatchingIp = expectedAddresses.some((expectedAddr) => {
        if (expectedAddr.includes(':')) {
          return awsRule.ipv6CidrBlock === expectedAddr;
        }
        return awsRule.cidrBlock === expectedAddr;
      });

      return hasMatchingIp;
    });
  }

  private async buildClient(settings: FirewallSettingsInternal | null): Promise<EC2Client> {
    // Try firewall settings credentials first
    if (settings?.awsAccessKeyId && settings.awsSecretAccessKey) {
      // Get region from server settings if available, otherwise use env default
      let region = env.AWS_REGION;
      if (this.serverSettingsProvider) {
        try {
          const serverSettings = await this.serverSettingsProvider.getSettings();
          if (serverSettings?.awsRegion) {
            region = serverSettings.awsRegion;
          }
        } catch (error) {
          // Use default region
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
        logger.debug({ err: error }, 'Failed to get server settings for verification fallback.');
      }
    }

    // If we get here, no credentials are configured
    throw new Error('AWS credentials are required. Configure AWS Access Key ID and Secret Access Key in server settings.');
  }

  async deleteNetworkAclEntry(ruleNumber: number, egress: boolean): Promise<void> {
    const settings = await this.settingsProvider.getSettings();

    if (!settings) {
      throw new Error('Firewall settings not configured');
    }

    if (!settings.networkAclId) {
      throw new Error('Network ACL ID not configured');
    }

    const client = await this.buildClient(settings);

    try {
      await client.send(
        new DeleteNetworkAclEntryCommand({
          NetworkAclId: settings.networkAclId,
          RuleNumber: ruleNumber,
          Egress: egress,
        }),
      );
      logger.info({ ruleNumber, egress, networkAclId: settings.networkAclId }, 'Network ACL entry deleted successfully');
    } catch (error) {
      const err = error as Error & { name?: string; Code?: string };
      if (err.name === 'InvalidNetworkAclEntry.NotFound' || err.Code === 'InvalidNetworkAclEntry.NotFound') {
        logger.debug({ ruleNumber, egress }, 'Network ACL entry already absent');
        // Don't throw - entry is already deleted, which is fine
        return;
      }
      logger.error({ err: error, ruleNumber, egress }, 'Failed to delete Network ACL entry');
      throw error;
    }
  }
}

