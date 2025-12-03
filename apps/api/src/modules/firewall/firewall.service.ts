import type { FirewallRule } from '@hosting/common';

import { logger } from '../../core/logger/index.js';
import { NotFoundError } from '../../shared/errors.js';
import type { CreateFirewallRuleInput, FirewallRepository, UpdateFirewallRuleInput } from './firewall.repository.js';
import { FirewallSyncService } from './firewall.sync-service.js';

export class FirewallService {
  constructor(
    private readonly repository: FirewallRepository,
    private readonly syncService: FirewallSyncService,
  ) {}

  listRules(): Promise<FirewallRule[]> {
    return this.repository.listRules();
  }

  async getRule(id: string): Promise<FirewallRule> {
    const rule = await this.repository.getRuleById(id);
    if (!rule) {
      throw new NotFoundError('Firewall rule not found');
    }
    return rule;
  }

  async createRule(input: CreateFirewallRuleInput): Promise<FirewallRule> {
    try {
      // CRITICAL: Apply to AWS FIRST - AWS is the source of truth
      // Only save to database if AWS operation succeeds
      const ruleInput = {
        action: input.action ?? 'allow',
        direction: input.direction,
        protocol: input.protocol,
        portRange: input.portRange ?? null,
        source: input.source ?? null,
        destination: input.destination ?? null,
        status: input.status ?? 'enabled',
      };

      // Apply to AWS first - throws if it fails
      await this.syncService.applyRuleToAws(ruleInput);

      // AWS operation succeeded - now save to database
      const rule = await this.repository.createRule({
        ...input,
      });

      // Update sync status to reflect successful AWS application
      // Note: For Network ACL rules, the initial apply used a temp ID to calculate rule number
      // The rule is already in AWS and working. The rule number difference is acceptable.
      try {
        await this.repository.updateSyncStatus(rule.id, 'synced', null);
        // Refetch the rule to get the updated sync status
        const updatedRule = await this.repository.getRuleById(rule.id);
        return updatedRule ?? rule;
      } catch (updateError) {
        // Log but don't fail - rule is saved and applied to AWS
        logger.warn({ err: updateError, ruleId: rule.id }, 'Failed to update sync status after successful AWS application');
        return rule;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ 
        err: error, 
        input,
        errorMessage,
        errorStack,
      }, 'Failed to create firewall rule - AWS operation failed');
      // Re-throw with a more descriptive message
      throw new Error(`Failed to create firewall rule: ${errorMessage}`);
    }
  }

  async updateRule(id: string, input: UpdateFirewallRuleInput): Promise<FirewallRule> {
    const existing = await this.repository.getRuleById(id);
    if (!existing) {
      throw new NotFoundError('Firewall rule not found');
    }

    // Build the updated rule input
    const updatedRuleInput = {
      action: input.action ?? existing.action,
      direction: input.direction ?? existing.direction,
      protocol: input.protocol ?? existing.protocol,
      portRange: input.portRange !== undefined ? input.portRange : existing.portRange,
      source: input.source !== undefined ? input.source : existing.source,
      destination: input.destination !== undefined ? input.destination : existing.destination,
      status: input.status ?? existing.status,
    };

    // CRITICAL: Apply to AWS FIRST
    // Revoke/delete old rule from AWS
    const settings = await this.syncService.resolveSettings();
    if (settings) {
      try {
        if (existing.action === 'allow') {
          await this.syncService.applySecurityGroupRuleInput(
            {
              action: existing.action,
              direction: existing.direction,
              protocol: existing.protocol,
              portRange: existing.portRange,
              source: existing.source,
              destination: existing.destination,
            },
            'revoke',
            settings,
          );
        } else {
          await this.syncService.deleteNetworkAclRule(existing, settings);
        }
      } catch (error) {
        logger.warn({ err: error, ruleId: id }, 'Failed to revoke old rule from AWS during update, continuing...');
      }
    }

    // Apply new rule to AWS - throws if it fails
    // Use existing rule ID to maintain consistent rule number for Network ACL rules
    await this.syncService.applyRuleToAws(updatedRuleInput, existing.id);

    // AWS operations succeeded - now update database
    const updated = await this.repository.updateRule(id, input);
    if (!updated) {
      throw new NotFoundError('Firewall rule not found');
    }

    // Update sync status to reflect successful AWS application
    try {
      await this.repository.updateSyncStatus(id, 'synced', null);
    } catch (updateError) {
      logger.warn({ err: updateError, ruleId: id }, 'Failed to update sync status after successful AWS update');
    }

    // Refetch the rule to get the updated sync status
    const refreshed = await this.repository.getRuleById(id);
    return refreshed ?? updated;
  }

  async deleteRule(id: string): Promise<void> {
    const existing = await this.repository.getRuleById(id);
    if (!existing) {
      throw new NotFoundError('Firewall rule not found');
    }

    const deleted = await this.repository.deleteRule(id);
    if (!deleted) {
      throw new NotFoundError('Firewall rule not found');
    }
    await this.syncService.applyRuleDeleted(existing);
  }
}

