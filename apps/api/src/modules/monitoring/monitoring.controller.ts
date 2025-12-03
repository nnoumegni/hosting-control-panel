import type { Request, Response } from 'express';
import { logger } from '../../core/logger/index.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { MonitoringService } from './monitoring.service.js';
import type { SSMAgentService } from './ssm-agent.service.js';
import type { S3DataService } from './s3-data.service.js';
import type {
  HeartbeatBody,
  LogEventBody,
  CreateAgentConfigBody,
  UpdateAgentConfigBody,
  InstanceIdParams,
  GetHeartbeatsQuery,
  GetLogEventsQuery,
  GetMetricsSummaryQuery,
} from './monitoring.schemas.js';

export const createMonitoringController = (service: MonitoringService, ssmAgentService: SSMAgentService, s3DataService: S3DataService) => ({
  // Heartbeat endpoints (for push-based monitoring)
  heartbeat: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as HeartbeatBody;
    const heartbeat = await service.saveHeartbeat(body);
    res.json(heartbeat);
  }),

  // Pull-based monitoring endpoint
  pullAgentStatus: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    try {
      const heartbeat = await service.pullAgentStatus(instanceId);
      if (!heartbeat) {
        res.status(404).json({ 
          error: 'Agent not running or not responding',
          instanceId,
          message: 'The agent may still be installing or the service may have failed to start. Check deployment status or try deploying again.',
        });
        return;
      }
      res.json(heartbeat);
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Failed to pull agent status');
      res.status(500).json({ 
        error: 'Failed to pull agent status',
        message: error.message || 'Unknown error occurred',
        instanceId,
      });
    }
  }),

  getLatestHeartbeat: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    
    // Use cached heartbeat from database (fast - no SSM calls)
    // The heartbeat is updated by the agent via push or periodic pulls
    const heartbeat = await service.getLatestHeartbeat(instanceId);
    if (!heartbeat) {
      res.status(404).json({ error: 'No heartbeat found for this instance' });
      return;
    }

    res.json(heartbeat);
  }),

  getHeartbeats: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as GetHeartbeatsQuery;
    const heartbeats = await service.getHeartbeats(query.instanceId, {
      limit: query.limit,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    res.json({ items: heartbeats });
  }),

  getOnlineAgents: asyncHandler(async (_req: Request, res: Response) => {
    const agents = await service.getOnlineAgents();
    res.json({ instanceIds: agents });
  }),

  // Log event endpoints
  saveLogEvent: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as LogEventBody;
    const event = await service.saveLogEvent(body);
    res.status(201).json(event);
  }),

  getLogEvents: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as GetLogEventsQuery;
    
    // Try to pull fresh log events from agent first
    try {
      const since = query.startDate || new Date(Date.now() - 60 * 60 * 1000); // Last hour if not specified
      await service.pullAndSaveLogEvents(query.instanceId, query.limit || 50, since);
    } catch (error) {
      // Log but don't fail - continue with cached events
      logger.debug({ err: error, instanceId: query.instanceId }, 'Failed to pull fresh log events');
    }
    
    // Return events from database (now includes freshly pulled ones)
    const events = await service.getLogEvents(query.instanceId, {
      limit: query.limit,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    res.json({ items: events });
  }),

  getLogEventsByIp: asyncHandler(async (req: Request, res: Response) => {
    const { ip } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const events = await service.getLogEventsByIp(ip, limit);
    res.json({ items: events });
  }),

  // Agent config endpoints
  getAgentConfig: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    const config = await service.getAgentConfig(instanceId);
    if (!config) {
      res.status(404).json({ error: 'Agent config not found' });
      return;
    }
    res.json(config);
  }),

  createAgentConfig: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateAgentConfigBody;
    const config = await service.saveAgentConfig(body);
    res.status(201).json(config);
  }),

  updateAgentConfig: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    const body = req.body as UpdateAgentConfigBody;
    const config = await service.updateAgentConfig(instanceId, body);
    res.json(config);
  }),

  deleteAgentConfig: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    await service.deleteAgentConfig(instanceId);
    res.status(204).send();
  }),

  // Agent deployment endpoints
  deployAgent: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    const config = req.body as Partial<CreateAgentConfigBody>;
    
    try {
      const result = await service.deployAgent(instanceId, config);
      res.json({
        message: 'Agent deployment initiated',
        commandId: result.commandId,
        config: result.config,
      });
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Failed to deploy agent');
      res.status(500).json({ error: error.message || 'Failed to deploy agent' });
    }
  }),

  checkDeploymentStatus: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId, commandId } = req.params;
    const status = await service.checkDeploymentStatus(instanceId, commandId);
    res.json(status);
  }),

  startMonitoring: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    const config = req.body as Partial<CreateAgentConfigBody>;
    
    try {
      const result = await service.startMonitoring(instanceId, config);
      res.json({
        message: 'Monitoring started',
        commandId: result.commandId,
        config: result.config,
      });
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Failed to start monitoring');
      res.status(500).json({ error: error.message || 'Failed to start monitoring' });
    }
  }),

  stopMonitoring: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    
    try {
      const result = await service.stopMonitoring(instanceId);
      res.json({
        message: 'Monitoring stopped',
        commandId: result.commandId,
      });
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Failed to stop monitoring');
      res.status(500).json({ error: error.message || 'Failed to stop monitoring' });
    }
  }),

  uninstallAgent: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    const result = await service.uninstallAgent(instanceId);
    res.json({
      message: 'Agent uninstall initiated',
      commandId: result.commandId,
    });
  }),

  // Metrics endpoints
  getMetricsSummary: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    const query = req.query as unknown as GetMetricsSummaryQuery;
    const summary = await service.getMetricsSummary(
      instanceId,
      query.startDate,
      query.endDate,
    );
    if (!summary) {
      res.status(404).json({ error: 'No metrics found for this instance' });
      return;
    }
    res.json(summary);
  }),

  // Test endpoints
  testLogFileAccess: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.params as InstanceIdParams;
    const { logPath } = req.query as { logPath?: string };
    
    if (!logPath) {
      res.status(400).json({ error: 'logPath query parameter is required' });
      return;
    }
    
    const result = await service.testLogFileAccess(instanceId, logPath);
    res.json(result);
  }),

  // Analytics endpoint - uses SSM agent service directly
  getAnalytics: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    // Fetch data directly from agent HTTP endpoint first (fast path)
    // Skip SSM checks to minimize latency - only use SSM if direct call fails
    let agentData: {
      total: number;
      since: string;
      stats?: {
        visitors: number;
        pageviews: number;
        countries: number;
        topBrowser?: string;
      };
      aggregations?: {
        byCountry: Record<string, number>;
        byBrowser: Record<string, number>;
        byPlatform: Record<string, number>;
      };
      topPaths: Array<{ key: string; count: number }>;
      topIPs: Array<{ key: string; count: number }>;
      topStatus: Array<{ key: string; count: number }>;
    } | null = null;

    // Try direct HTTP endpoint first (primary source - fast path)
    try {
      try {
        agentData = await ssmAgentService.fetchAgentDataDirect(instanceId, '/live/summary') as {
          total: number;
          since: string;
          stats?: {
            visitors: number;
            pageviews: number;
            countries: number;
            topBrowser?: string;
          };
          aggregations?: {
            byCountry: Record<string, number>;
            byBrowser: Record<string, number>;
            byPlatform: Record<string, number>;
          };
          topPaths: Array<{ key: string; count: number }>;
          topIPs: Array<{ key: string; count: number }>;
          topStatus: Array<{ key: string; count: number }>;
        };
        logger.debug({ instanceId, total: agentData.total }, 'Retrieved analytics data from live agent endpoint');
      } catch (fetchError: any) {
          logger.error({ err: fetchError, instanceId }, 'Failed to fetch analytics data from direct endpoint');
          
          // If direct endpoint fails, check agent status via SSM to determine next steps
          let agentStatus;
          try {
            agentStatus = await ssmAgentService.checkAgentStatus(instanceId);
          } catch (statusErr: any) {
            // SSM check failed, return the original fetch error
            const errorMessage = fetchError.message || 'Failed to fetch analytics data';
            res.status(500).json({ 
              error: errorMessage,
              code: 'FETCH_FAILED',
            });
            return;
          }

          // If agent is not installed, trigger installation
          if (!agentStatus.isInstalled && !agentStatus.installationInProgress) {
            logger.info({ instanceId }, 'Agent not installed, triggering installation');
            try {
              const installResult = await ssmAgentService.installAgent(instanceId);
              res.status(202).json({
                message: 'Setting up Analytics',
                code: 'AGENT_INSTALLING',
                commandId: installResult.commandId,
                status: 'Agent installation started. Please wait a moment and refresh.',
              });
              return;
            } catch (installErr: any) {
              logger.error({ err: installErr, instanceId }, 'Error during agent installation');
              const errorMessage = fetchError.message || 'Failed to fetch analytics data';
              res.status(500).json({ 
                error: errorMessage,
                code: 'FETCH_FAILED',
              });
              return;
            }
          }

          // If agent is installed but not running
          if (agentStatus.isInstalled && !agentStatus.isRunning) {
            res.status(503).json({
              error: 'Analytics agent is installed but not running',
              code: 'AGENT_NOT_RUNNING',
              message: 'The analytics agent is installed but the service is not running. Please check the instance.',
            });
            return;
          }

          // Fall back to S3 if direct endpoint fails but agent is running
          if (agentStatus.isInstalled && agentStatus.isRunning) {
            try {
              logger.debug({ instanceId }, 'Falling back to S3 data');
              const machineId = await ssmAgentService.getMachineId(instanceId);
              const endDate = new Date();
              const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
              const s3Data = await s3DataService.getAggregatedAnalytics(instanceId, machineId, {
                startDate,
                endDate,
              });

              agentData = {
                total: s3Data.total,
                since: s3Data.since,
                stats: s3Data.stats,
                aggregations: s3Data.aggregations,
                topPaths: s3Data.topPaths,
                topIPs: s3Data.topIPs,
                topStatus: s3Data.topStatus,
              };
              logger.info({ instanceId, machineId, total: s3Data.total }, 'Retrieved analytics data from S3 (fallback)');
            } catch (s3Err: any) {
              logger.error({ err: s3Err, instanceId }, 'Failed to get data from both direct endpoint and S3');
              const errorMessage = fetchError.message || 'Failed to fetch analytics data';
              res.status(500).json({ 
                error: errorMessage,
                code: 'FETCH_FAILED',
              });
              return;
            }
          } else {
            const errorMessage = fetchError.message || 'Failed to fetch analytics data';
            res.status(500).json({ 
              error: errorMessage,
              code: 'FETCH_FAILED',
            });
            return;
          }
        }

      if (!agentData) {
        res.status(500).json({ 
          error: 'Failed to retrieve analytics data from both S3 and live endpoint',
          code: 'DATA_UNAVAILABLE',
        });
        return;
      }

      // Check if this is the new aggregated format
      if (agentData.aggregations && agentData.stats) {
        // New aggregated format - use data directly
        const aggregations = agentData.aggregations;
        const stats = agentData.stats;

        // Convert aggregations to analyticsData format for frontend compatibility
        // Create a simplified analyticsData array from aggregations for chart rendering
        const analyticsData: Array<{ ip: string; country: string; browser: string; platform: string; url: string; count: number }> = [];
        
        // Build analyticsData from country aggregations (for map/charts)
        // We'll create entries for each country with aggregated counts
        Object.entries(aggregations.byCountry).forEach(([country, count]) => {
          // Find the most common browser/platform for this country (simplified)
          const topBrowser = Object.entries(aggregations.byBrowser).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
          const topPlatform = Object.entries(aggregations.byPlatform).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
          
          analyticsData.push({
            ip: 'Aggregated', // Not individual IPs anymore
            country: country,
            browser: topBrowser,
            platform: topPlatform,
            url: '/',
            count: count,
          });
        });

        const responseData = {
          analyticsData,
          stats: {
            visitors: stats.visitors,
            pageviews: stats.pageviews || agentData.total,
            countries: stats.countries,
            topBrowser: stats.topBrowser || Object.entries(aggregations.byBrowser).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
          },
          aggregations: aggregations, // Include raw aggregations for direct chart use
          topPaths: agentData.topPaths,
          topIPs: agentData.topIPs,
          topStatus: agentData.topStatus,
          since: agentData.since,
        };

        res.json(responseData);
      } else {
        // Fallback: old format (shouldn't happen with new agent, but handle gracefully)
        // Return empty data structure
        const fallbackData = {
          analyticsData: [],
          stats: {
            visitors: 0,
            pageviews: agentData.total || 0,
            countries: 0,
            topBrowser: '-',
          },
          topPaths: agentData.topPaths || [],
          topIPs: agentData.topIPs || [],
          topStatus: agentData.topStatus || [],
          since: agentData.since,
        };

        res.json(fallbackData);
      }
    } catch (error: any) {
      logger.error({ err: error, instanceId, errorCode: error.code, errorCause: error.cause }, 'Failed to get analytics');
      
      const errorMessage = error.message || 'Failed to get analytics';
      res.status(500).json({ 
        error: errorMessage,
        code: error.code || 'FETCH_ERROR',
        details: process.env.NODE_ENV === 'development' ? {
          originalError: error.message,
          errorCode: error.code,
          cause: error.cause?.message,
        } : undefined,
      });
    }
  }),

  // System metrics endpoint - fetches system info and top processes from agent
  getSystemMetrics: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const { top } = req.query as { top?: string };
    
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    const topCount = top ? parseInt(top, 10) : 20;
    if (isNaN(topCount) || topCount < 1 || topCount > 100) {
      res.status(400).json({ error: 'top parameter must be a number between 1 and 100' });
      return;
    }

    try {
      // Fetch system data directly from agent HTTP endpoint
      const systemData = await ssmAgentService.fetchAgentDataDirect(instanceId, `/system?top=${topCount}`);
      
      res.json(systemData);
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Failed to get system metrics');
      
      const errorMessage = error.message || 'Failed to get system metrics';
      res.status(500).json({ 
        error: errorMessage,
        code: error.code || 'FETCH_ERROR',
      });
    }
  }),
});

