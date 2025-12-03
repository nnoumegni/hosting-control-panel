import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
} from '@aws-sdk/client-cost-explorer';
import { BudgetsClient, DescribeBudgetsCommand } from '@aws-sdk/client-budgets';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

export interface BillingOverview {
  totalCost: number;
  startDate: string;
  endDate: string;
  budget: {
    limit: number;
    spent: number;
    remaining: number;
    percentUsed: number;
    status: string;
  };
  forecast: {
    cost: number;
    date: string;
  };
  costByService: Array<{
    service: string;
    cost: number;
    percent: number;
  }>;
}

export class BillingService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async buildCostExplorerClient(): Promise<CostExplorerClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    return new CostExplorerClient({
      region: 'us-east-1', // Cost Explorer is only available in us-east-1
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  private async buildBudgetsClient(): Promise<BudgetsClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    return new BudgetsClient({
      region: 'us-east-1', // Budgets is only available in us-east-1
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Get billing overview for the current month
   */
  async getBillingOverview(): Promise<BillingOverview> {
    try {
      const costClient = await this.buildCostExplorerClient();
      const budgetsClient = await this.buildBudgetsClient();

      // Get current month date range
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];

      // Get cost and usage for current month
      const costCommand = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDateStr,
          End: todayStr,
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      });

      const costResponse = await costClient.send(costCommand);
      
      // Get cost breakdown by service
      const costByService: Array<{ service: string; cost: number; percent: number }> = [];
      let totalCost = 0;
      
      if (costResponse.ResultsByTime?.[0]?.Groups) {
        for (const group of costResponse.ResultsByTime[0].Groups) {
          const service = group.Keys?.[0] ?? 'Unknown';
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount ?? '0');
          if (cost > 0) {
            totalCost += cost;
            costByService.push({
              service,
              cost,
              percent: 0, // Will calculate after we have total
            });
          }
        }
      }

      // Sort by cost descending
      costByService.sort((a, b) => b.cost - a.cost);
      
      // Calculate percentages now that we have the total
      if (totalCost > 0) {
        for (const service of costByService) {
          service.percent = (service.cost / totalCost) * 100;
        }
      }
      
      // Fallback to Total field if groups didn't provide a total (shouldn't happen, but just in case)
      if (totalCost === 0 && costResponse.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount) {
        totalCost = parseFloat(costResponse.ResultsByTime[0].Total.UnblendedCost.Amount);
      }

      // Get forecast for end of month
      const forecastCommand = new GetCostForecastCommand({
        TimePeriod: {
          Start: todayStr,
          End: endDateStr,
        },
        Metric: 'UNBLENDED_COST',
        Granularity: 'MONTHLY',
      });

      let forecastCost = totalCost;
      try {
        const forecastResponse = await costClient.send(forecastCommand);
        const forecastAmount = forecastResponse.Total?.Amount;
        if (forecastAmount) {
          forecastCost = parseFloat(forecastAmount);
        }
      } catch (error) {
        logger.warn({ err: error }, 'Failed to get cost forecast, using current cost');
      }

      // Get budget information
      let budget = {
        limit: 0,
        spent: totalCost,
        remaining: 0,
        percentUsed: 0,
        status: 'No Budget Set',
      };

      try {
        const budgetsCommand = new DescribeBudgetsCommand({
          AccountId: undefined, // Use default account
        });
        const budgetsResponse = await budgetsClient.send(budgetsCommand);
        const budgets = budgetsResponse.Budgets ?? [];

        // Find the first cost budget
        const costBudget = budgets.find((b) => b.BudgetType === 'COST');
        if (costBudget && costBudget.BudgetLimit?.Amount) {
          const limit = parseFloat(costBudget.BudgetLimit.Amount);
          budget = {
            limit,
            spent: totalCost,
            remaining: Math.max(0, limit - totalCost),
            percentUsed: limit > 0 ? (totalCost / limit) * 100 : 0,
            status: totalCost > limit ? 'Exceeded' : 'Within Budget',
          };
        }
      } catch (error) {
        logger.warn({ err: error }, 'Failed to get budget information');
      }

      return {
        totalCost,
        startDate: startDateStr,
        endDate: todayStr,
        budget,
        forecast: {
          cost: forecastCost,
          date: endDateStr,
        },
        costByService,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get billing overview');
      throw error;
    }
  }
}

