import {
  SESClient,
  ListIdentitiesCommand,
  GetIdentityVerificationAttributesCommand,
  VerifyEmailIdentityCommand,
  DeleteIdentityCommand,
  GetSendQuotaCommand,
} from '@aws-sdk/client-ses';
import { logger } from '../../core/logger/index.js';
import { HttpError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

export interface SESEmailIdentity {
  email: string;
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
  verificationToken?: string;
}

export interface EmailManagementOverview {
  identities: SESEmailIdentity[];
  sendQuota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  } | null;
  domains: string[];
}

export class EmailService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async buildSESClient(): Promise<SESClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new HttpError('AWS credentials not configured. Please configure AWS credentials in AWS Settings.', 400);
    }

    // SES is available in specific regions. Use us-east-1 as default (SES home region)
    // If the configured region doesn't support SES, it will fail with a clear error
    const region = serverSettings.awsRegion ?? 'us-east-1';

    return new SESClient({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * List all verified email identities and their status
   */
  async listIdentities(): Promise<EmailManagementOverview> {
    try {
      const client = await this.buildSESClient();
      
      logger.debug('Fetching SES identities');

      // List all identities (emails and domains)
      const listResponse = await client.send(new ListIdentitiesCommand({}));
      const identityNames = listResponse.Identities ?? [];

      if (identityNames.length === 0) {
        return {
          identities: [],
          sendQuota: null,
          domains: [],
        };
      }

      // Get verification status for all identities
      // AWS SES limits: can only get verification attributes for up to 100 identities at a time
      const verificationAttributes: Record<string, { VerificationStatus?: string; VerificationToken?: string }> = {};
      const BATCH_SIZE = 100;
      
      for (let i = 0; i < identityNames.length; i += BATCH_SIZE) {
        const batch = identityNames.slice(i, i + BATCH_SIZE);
        const verificationResponse = await client.send(
          new GetIdentityVerificationAttributesCommand({
            Identities: batch,
          }),
        );
        
        if (verificationResponse.VerificationAttributes) {
          Object.assign(verificationAttributes, verificationResponse.VerificationAttributes);
        }
      }

      // Parse identities into email/domain structure
      const identities: SESEmailIdentity[] = [];
      const domains = new Set<string>();

      for (const identity of identityNames) {
        if (!identity || typeof identity !== 'string') {
          logger.warn({ identity }, 'Skipping invalid identity');
          continue;
        }

        const attrs = verificationAttributes[identity];
        const status = attrs?.VerificationStatus;

        // Determine if it's an email or domain
        const isEmail = identity.includes('@');
        let domain: string;
        
        if (isEmail) {
          const parts = identity.split('@');
          if (parts.length !== 2 || !parts[1]) {
            logger.warn({ identity }, 'Skipping invalid email identity');
            continue;
          }
          domain = parts[1];
        } else {
          domain = identity;
        }

        if (!domain) {
          logger.warn({ identity }, 'Skipping identity with no domain');
          continue;
        }

        domains.add(domain);

        let sesStatus: 'Verified' | 'Pending' | 'Failed' = 'Pending';
        if (status === 'Success') {
          sesStatus = 'Verified';
        } else if (status === 'Failed') {
          sesStatus = 'Failed';
        }

        if (isEmail) {
          identities.push({
            email: identity,
            domain,
            status: sesStatus,
            verificationToken: attrs?.VerificationToken,
          });
        } else {
          // For domain identities, we might want to show them differently
          // For now, we'll include them as domain-only entries
          identities.push({
            email: `*@${identity}`,
            domain: identity,
            status: sesStatus,
            verificationToken: attrs?.VerificationToken,
          });
        }
      }

      // Get send quota
      let sendQuota = null;
      try {
        const quotaResponse = await client.send(new GetSendQuotaCommand({}));
        sendQuota = {
          max24HourSend: quotaResponse.Max24HourSend ?? 0,
          maxSendRate: quotaResponse.MaxSendRate ?? 0,
          sentLast24Hours: quotaResponse.SentLast24Hours ?? 0,
        };
      } catch (error) {
        logger.warn({ err: error }, 'Failed to get SES send quota');
      }

      return {
        identities,
        sendQuota,
        domains: Array.from(domains).sort(),
      };
    } catch (error) {
      // If it's already an HttpError, re-throw it directly
      if (error instanceof HttpError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, errorMessage }, 'Failed to list SES identities');
      
      // Provide more helpful error messages with appropriate status codes
      if (errorMessage.includes('credentials') || errorMessage.includes('Credential')) {
        throw new HttpError('AWS credentials are invalid or not configured. Please check your AWS Settings.', 400);
      }
      if (errorMessage.includes('region') || errorMessage.includes('Region')) {
        throw new HttpError(`SES is not available in the configured region. SES is available in us-east-1, us-west-2, and eu-west-1.`, 400);
      }
      if (errorMessage.includes('AccessDenied') || errorMessage.includes('permission')) {
        throw new HttpError('Insufficient AWS permissions. The credentials need ses:ListIdentities and ses:GetIdentityVerificationAttributes permissions.', 403);
      }
      
      throw error;
    }
  }

  /**
   * Verify an email identity
   */
  async verifyEmailIdentity(email: string): Promise<void> {
    try {
      const client = await this.buildSESClient();
      await client.send(
        new VerifyEmailIdentityCommand({
          EmailAddress: email,
        }),
      );
      logger.info({ email }, 'Initiated email verification');
    } catch (error) {
      logger.error({ err: error, email }, 'Failed to verify email identity');
      throw error;
    }
  }

  /**
   * Delete an email identity
   */
  async deleteIdentity(identity: string): Promise<void> {
    try {
      // Strip *@ prefix for domain identities (AWS SES expects just the domain name)
      const actualIdentity = identity.startsWith('*@') ? identity.substring(2) : identity;
      
      const client = await this.buildSESClient();
      await client.send(
        new DeleteIdentityCommand({
          Identity: actualIdentity,
        }),
      );
      logger.info({ identity, actualIdentity }, 'Deleted SES identity');
    } catch (error) {
      logger.error({ err: error, identity }, 'Failed to delete SES identity');
      throw error;
    }
  }
}

