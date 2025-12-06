import {
  SESv2Client,
  PutSuppressedDestinationCommand,
  DeleteSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  GetSuppressedDestinationCommand,
  PutAccountSuppressionAttributesCommand,
  PutAccountSendingAttributesCommand,
  GetAccountCommand,
  UpdateEmailIdentityPolicyCommand,
  GetEmailIdentityPoliciesCommand,
  DeleteEmailIdentityPolicyCommand,
} from '@aws-sdk/client-sesv2';
import { logger } from '../../core/logger/index.js';
import { HttpError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

export interface SuppressedDestination {
  emailAddress: string;
  reason: 'BOUNCE' | 'COMPLAINT';
  lastUpdateTime: string;
  attributes?: {
    messageId?: string;
    feedbackId?: string;
  };
}

export interface SuppressionListResponse {
  items: SuppressedDestination[];
  total: number;
  nextToken?: string;
}

export interface SecurityActionResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export interface IdentityPolicy {
  policyName: string;
  policy: string;
}

export class EmailSecurityService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async buildSESClient(): Promise<SESv2Client> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new HttpError('AWS credentials not configured. Please configure AWS credentials in AWS Settings.', 400);
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';

    return new SESv2Client({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  private async buildSESv2Client(): Promise<SESv2Client> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new HttpError('AWS credentials not configured. Please configure AWS credentials in AWS Settings.', 400);
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';

    return new SESv2Client({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Pause account-level sending (emergency stop)
   */
  async pauseAccountSending(): Promise<SecurityActionResponse> {
    try {
      const client = await this.buildSESv2Client();
      await client.send(new PutAccountSendingAttributesCommand({ SendingEnabled: false }));
      
      logger.warn('Account-level sending has been PAUSED');
      
      return {
        success: true,
        message: 'Account-level sending has been paused. No emails will be sent until resumed.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to pause account sending');
      throw new HttpError('Failed to pause account sending', 500);
    }
  }

  /**
   * Resume account-level sending
   */
  async resumeAccountSending(): Promise<SecurityActionResponse> {
    try {
      const client = await this.buildSESv2Client();
      await client.send(new PutAccountSendingAttributesCommand({ SendingEnabled: true }));
      
      logger.info('Account-level sending has been RESUMED');
      
      return {
        success: true,
        message: 'Account-level sending has been resumed.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to resume account sending');
      throw new HttpError('Failed to resume account sending', 500);
    }
  }

  /**
   * Get account sending status (SES v2)
   */
  async getAccountSendingStatus(): Promise<{ enabled: boolean }> {
    try {
      const client = await this.buildSESv2Client();
      const response = await client.send(new GetAccountCommand({}));
      return {
        enabled: response.SendingEnabled ?? false,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get account sending status');
      throw new HttpError('Failed to get account sending status', 500);
    }
  }

  /**
   * Add email to suppression list
   */
  async addToSuppressionList(emailAddress: string, reason: 'BOUNCE' | 'COMPLAINT'): Promise<SecurityActionResponse> {
    try {
      const client = await this.buildSESv2Client();
      
      await client.send(
        new PutSuppressedDestinationCommand({
          EmailAddress: emailAddress,
          Reason: reason,
        }),
      );

      logger.info({ emailAddress, reason }, 'Added email to suppression list');

      return {
        success: true,
        message: `Email ${emailAddress} has been added to the ${reason.toLowerCase()} suppression list.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, emailAddress, reason }, 'Failed to add to suppression list');
      
      if (errorMessage.includes('already exists')) {
        throw new HttpError(`Email ${emailAddress} is already in the suppression list`, 409);
      }
      
      throw new HttpError('Failed to add email to suppression list', 500);
    }
  }

  /**
   * Remove email from suppression list
   */
  async removeFromSuppressionList(emailAddress: string): Promise<SecurityActionResponse> {
    try {
      const client = await this.buildSESv2Client();
      
      await client.send(
        new DeleteSuppressedDestinationCommand({
          EmailAddress: emailAddress,
        }),
      );

      logger.info({ emailAddress }, 'Removed email from suppression list');

      return {
        success: true,
        message: `Email ${emailAddress} has been removed from the suppression list.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error, emailAddress }, 'Failed to remove from suppression list');
      throw new HttpError('Failed to remove email from suppression list', 500);
    }
  }

  /**
   * Get suppression list with pagination
   */
  async getSuppressionList(
    reason?: 'BOUNCE' | 'COMPLAINT',
    nextToken?: string,
    pageSize: number = 100,
  ): Promise<SuppressionListResponse> {
    try {
      const client = await this.buildSESv2Client();
      
      const response = await client.send(
        new ListSuppressedDestinationsCommand({
          Reasons: reason ? [reason] : undefined,
          NextToken: nextToken,
          PageSize: pageSize,
        }),
      );

      const items: SuppressedDestination[] =
        response.SuppressedDestinationSummaries?.map((item) => ({
          emailAddress: item.EmailAddress ?? '',
          reason: (item.Reason as 'BOUNCE' | 'COMPLAINT') ?? 'BOUNCE',
          lastUpdateTime: item.LastUpdateTime?.toISOString() ?? new Date().toISOString(),
          attributes: undefined, // Attributes not available in summary, use GetSuppressedDestination for details
        })) ?? [];

      return {
        items,
        total: items.length,
        nextToken: response.NextToken,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get suppression list');
      throw new HttpError('Failed to get suppression list', 500);
    }
  }

  /**
   * Get suppression list statistics
   */
  async getSuppressionStats(): Promise<{ bounce: number; complaint: number; total: number }> {
    try {
      const [bounceList, complaintList] = await Promise.all([
        this.getSuppressionList('BOUNCE').catch(() => ({ items: [], total: 0 })),
        this.getSuppressionList('COMPLAINT').catch(() => ({ items: [], total: 0 })),
      ]);

      return {
        bounce: bounceList.total,
        complaint: complaintList.total,
        total: bounceList.total + complaintList.total,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get suppression stats');
      return { bounce: 0, complaint: 0, total: 0 };
    }
  }

  /**
   * Get suppressed destination details
   */
  async getSuppressedDestination(emailAddress: string): Promise<SuppressedDestination | null> {
    try {
      const client = await this.buildSESv2Client();
      
      const response = await client.send(
        new GetSuppressedDestinationCommand({
          EmailAddress: emailAddress,
        }),
      );

      if (!response.SuppressedDestination) {
        return null;
      }

      return {
        emailAddress: response.SuppressedDestination.EmailAddress ?? emailAddress,
        reason: (response.SuppressedDestination.Reason as 'BOUNCE' | 'COMPLAINT') ?? 'BOUNCE',
        lastUpdateTime: response.SuppressedDestination.LastUpdateTime?.toISOString() ?? new Date().toISOString(),
        attributes: {
          messageId: response.SuppressedDestination.Attributes?.MessageId,
          feedbackId: response.SuppressedDestination.Attributes?.FeedbackId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return null;
      }
      logger.error({ err: error, emailAddress }, 'Failed to get suppressed destination');
      throw new HttpError('Failed to get suppressed destination', 500);
    }
  }

  /**
   * Block an identity from sending (using identity policy) - SES v2
   */
  async blockIdentity(identity: string): Promise<SecurityActionResponse> {
    try {
      const client = await this.buildSESClient();
      const policyName = 'BlockSending';
      
      // Create a policy that denies all SendEmail actions
      const denyPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Deny',
            Action: ['ses:SendEmail', 'ses:SendRawEmail'],
            Resource: '*',
          },
        ],
      };

      await client.send(
        new UpdateEmailIdentityPolicyCommand({
          EmailIdentity: identity,
          PolicyName: policyName,
          Policy: JSON.stringify(denyPolicy),
        }),
      );

      logger.warn({ identity }, 'Identity has been BLOCKED from sending');

      return {
        success: true,
        message: `Identity ${identity} has been blocked from sending emails.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error, identity }, 'Failed to block identity');
      throw new HttpError('Failed to block identity', 500);
    }
  }

  /**
   * Unblock an identity (remove blocking policy) - SES v2
   */
  async unblockIdentity(identity: string): Promise<SecurityActionResponse> {
    try {
      const client = await this.buildSESClient();
      const policyName = 'BlockSending';

      await client.send(
        new DeleteEmailIdentityPolicyCommand({
          EmailIdentity: identity,
          PolicyName: policyName,
        }),
      );

      logger.info({ identity }, 'Identity has been UNBLOCKED');

      return {
        success: true,
        message: `Identity ${identity} has been unblocked and can send emails again.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        // Policy doesn't exist, so identity is already unblocked
        return {
          success: true,
          message: `Identity ${identity} is not blocked.`,
          timestamp: new Date().toISOString(),
        };
      }
      logger.error({ err: error, identity }, 'Failed to unblock identity');
      throw new HttpError('Failed to unblock identity', 500);
    }
  }

  /**
   * Get identity policies (SES v2)
   * Note: SES v2 GetEmailIdentityPoliciesCommand returns all policies for an identity
   */
  async getIdentityPolicies(identity: string): Promise<IdentityPolicy[]> {
    try {
      const client = await this.buildSESClient();
      
      const getResponse = await client.send(
        new GetEmailIdentityPoliciesCommand({
          EmailIdentity: identity,
        }),
      );

      if (!getResponse.Policies) {
        return [];
      }

      // Convert Policies object to array
      const policies: IdentityPolicy[] = [];
      for (const [policyName, policy] of Object.entries(getResponse.Policies)) {
        policies.push({
          policyName,
          policy,
        });
      }

      return policies;
    } catch (error) {
      // If identity doesn't exist or has no policies, return empty array
      logger.debug({ err: error, identity }, 'No policies found for identity');
      return [];
    }
  }

  /**
   * Check if identity is blocked
   */
  async isIdentityBlocked(identity: string): Promise<boolean> {
    try {
      const policies = await this.getIdentityPolicies(identity);
      return policies.some((p) => p.policyName === 'BlockSending');
    } catch {
      return false;
    }
  }

  /**
   * Bulk add emails to suppression list
   */
  async bulkAddToSuppressionList(
    emailAddresses: string[],
    reason: 'BOUNCE' | 'COMPLAINT',
  ): Promise<{ success: number; failed: number; errors: Array<{ email: string; error: string }> }> {
    const results = { success: 0, failed: 0, errors: [] as Array<{ email: string; error: string }> };

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < emailAddresses.length; i += BATCH_SIZE) {
      const batch = emailAddresses.slice(i, i + BATCH_SIZE);
      
      await Promise.allSettled(
        batch.map(async (email) => {
          try {
            await this.addToSuppressionList(email, reason);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              email,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }),
      );

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < emailAddresses.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Enable account-level suppression list
   */
  async enableAccountSuppression(): Promise<SecurityActionResponse> {
    try {
      const client = await this.buildSESv2Client();
      
      await client.send(
        new PutAccountSuppressionAttributesCommand({
          SuppressedReasons: ['BOUNCE', 'COMPLAINT'],
        }),
      );

      logger.info('Account-level suppression list has been ENABLED');

      return {
        success: true,
        message: 'Account-level suppression list has been enabled. SES will automatically suppress bounces and complaints.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to enable account suppression');
      throw new HttpError('Failed to enable account suppression', 500);
    }
  }
}

