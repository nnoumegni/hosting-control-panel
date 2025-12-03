import { logger } from '../../core/logger/index.js';
import type { InstanceStatusRepository } from './instance-status.repository.js';
import type { DomainsService } from './domains.service.js';
import type { SSMAgentService } from './ssm-agent.service.js';

export class InstanceStatusService {
  constructor(
    private readonly statusRepository: InstanceStatusRepository,
    private readonly domainsService: DomainsService,
    private readonly ssmAgentService: SSMAgentService,
  ) {}

  /**
   * Get cached status from database, or fetch fresh if not found or stale
   */
  async getStatus(instanceId: string, forceRefresh = false): Promise<{
    instanceId: string;
    webServer: {
      type: 'nginx' | 'apache' | 'none';
      version?: string;
      isRunning: boolean;
    };
    ssmAgent: {
      isInstalled: boolean;
      isRunning: boolean;
    };
    publicIp?: string;
    lastChecked: Date;
    lastUpdated: Date;
  } | null> {
    if (!forceRefresh) {
      const cached = await this.statusRepository.getStatus(instanceId);
      
      // Return cached status if it's less than 5 minutes old
      if (cached) {
        const age = Date.now() - cached.lastChecked.getTime();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        if (age < maxAge) {
          logger.debug({ instanceId, age: Math.round(age / 1000) }, 'Returning cached instance status');
          return cached;
        }

        logger.debug({ instanceId, age: Math.round(age / 1000) }, 'Cached status is stale, refreshing');
      }
    }

    // Fetch fresh status
    return this.refreshStatus(instanceId);
  }

  /**
   * Refresh status from live sources and save to database
   */
  async refreshStatus(instanceId: string): Promise<{
    instanceId: string;
    webServer: {
      type: 'nginx' | 'apache' | 'none';
      version?: string;
      isRunning: boolean;
    };
    ssmAgent: {
      isInstalled: boolean;
      isRunning: boolean;
    };
    publicIp?: string;
    lastChecked: Date;
    lastUpdated: Date;
  } | null> {
    try {
      logger.debug({ instanceId }, 'Refreshing instance status');

      // Get server info (includes web server status)
      const serverInfo = await this.domainsService.getServerInfo(instanceId);

      // Get SSM agent status
      const ssmAgentStatus = await this.ssmAgentService.checkAgentStatus(instanceId);

      const status = {
        instanceId,
        webServer: serverInfo.webServer,
        ssmAgent: {
          isInstalled: ssmAgentStatus.isInstalled,
          isRunning: ssmAgentStatus.isRunning,
        },
        publicIp: serverInfo.publicIp,
        lastChecked: new Date(),
        lastUpdated: new Date(),
      };

      // Save to database
      await this.statusRepository.saveStatus(status);

      logger.debug({ instanceId }, 'Instance status refreshed and saved');

      return status;
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to refresh instance status');
      throw error;
    }
  }

  /**
   * Update specific fields of status (for immediate updates when changes occur)
   */
  async updateStatusField(
    instanceId: string,
    field: 'webServer' | 'ssmAgent',
    value: any,
  ): Promise<void> {
    try {
      await this.statusRepository.updateStatus(instanceId, {
        [field]: value,
      });
      logger.debug({ instanceId, field }, 'Updated instance status field');
    } catch (error) {
      logger.error({ err: error, instanceId, field }, 'Failed to update instance status field');
      throw error;
    }
  }

  /**
   * Refresh status for all tracked instances (for cron job)
   */
  async refreshAllStatuses(): Promise<void> {
    logger.info('Starting periodic refresh of all instance statuses');

    try {
      // Get all tracked instance IDs from the repository
      const instanceIds = await this.statusRepository.getAllInstanceIds();

      if (instanceIds.length === 0) {
        logger.debug('No tracked instances found');
        return;
      }

      logger.info({ count: instanceIds.length }, 'Refreshing status for tracked instances');

      // Refresh each instance (in parallel)
      const refreshPromises = instanceIds.map((instanceId) =>
        this.refreshStatus(instanceId).catch((error) => {
          logger.error({ err: error, instanceId }, 'Failed to refresh instance status');
          return null;
        }),
      );

      await Promise.all(refreshPromises);

      logger.info('Completed periodic refresh of all instance statuses');
    } catch (error) {
      logger.error({ err: error }, 'Failed to refresh all instance statuses');
    }
  }

}

