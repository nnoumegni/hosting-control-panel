import * as cron from 'node-cron';
import { logger } from '../logger/index.js';
import type { InstanceStatusService } from '../../modules/domains/instance-status.service.js';

export class StatusRefreshScheduler {
  private task: ReturnType<typeof cron.schedule> | null = null;

  constructor(private readonly statusService: InstanceStatusService) {}

  /**
   * Start the scheduler to refresh instance statuses periodically
   * Default: Every 5 minutes
   */
  start(cronExpression = '*/5 * * * *'): void {
    if (this.task) {
      logger.warn('Status refresh scheduler is already running');
      return;
    }

    logger.info({ cronExpression }, 'Starting status refresh scheduler');

    this.task = cron.schedule(cronExpression, async () => {
      try {
        await this.statusService.refreshAllStatuses();
      } catch (error) {
        logger.error({ err: error }, 'Error in status refresh scheduler');
      }
    });

    logger.info('Status refresh scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Status refresh scheduler stopped');
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.task !== null;
  }
}

