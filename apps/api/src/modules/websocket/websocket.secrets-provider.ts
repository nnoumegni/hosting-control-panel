/**
 * Agent secrets provider
 * Retrieves agent secrets for WebSocket authentication using AWS secret access key
 */

import type { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { logger } from '../../core/logger/index.js';

export class AgentSecretsProvider {
  constructor(private serverSettingsProvider: ServerSettingsProvider) {}

  /**
   * Get secret for an agent using AWS secret access key
   * The secret is the AWS secret access key itself, ensuring it works out of the box
   */
  async getSecret(agentId: string): Promise<string | null> {
    try {
      const settings = await this.serverSettingsProvider.getSettings();
      if (!settings?.awsSecretAccessKey) {
        logger.warn({ agentId }, 'AWS secret access key not configured');
        return null;
      }
      return settings.awsSecretAccessKey;
    } catch (error) {
      logger.error({ agentId, error }, 'Failed to get agent secret');
      return null;
    }
  }

}

