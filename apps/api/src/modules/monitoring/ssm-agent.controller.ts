import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { logger } from '../../core/logger/index.js';
import type { SSMAgentService } from './ssm-agent.service.js';

export const createSSMAgentController = (ssmAgentService: SSMAgentService) => ({
  // Check agent status on an instance via SSM
  getAgentStatus: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    logger.debug({ instanceId }, 'Checking agent status');
    const status = await ssmAgentService.checkAgentStatus(instanceId);
    logger.debug({ instanceId, status }, 'Agent status result');
    res.json(status);
  }),

  // Install agent on an instance
  installAgent: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.body;
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId is required in request body' });
      return;
    }

    logger.info({ instanceId }, 'Installing agent');
    const result = await ssmAgentService.installAgent(instanceId);
    res.json(result);
  }),

  // Uninstall agent from an instance
  uninstallAgent: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.body;
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId is required in request body' });
      return;
    }

    logger.info({ instanceId }, 'Uninstalling agent');
    const result = await ssmAgentService.uninstallAgent(instanceId);
    res.json(result);
  }),

  // Check command status
  checkCommandStatus: asyncHandler(async (req: Request, res: Response) => {
    const { commandId, instanceId } = req.query;
    if (!commandId || typeof commandId !== 'string') {
      res.status(400).json({ error: 'commandId query parameter is required' });
      return;
    }
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    const status = await ssmAgentService.checkCommandStatus(commandId, instanceId);
    res.json(status);
  }),

  // Test connectivity and diagnose issues
  testConnectivity: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    const result = await ssmAgentService.testConnectivity(instanceId);
    res.json(result);
  }),

  // Fetch live data from agent
  getAgentData: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query;
    const endpoint = (req.query.endpoint as string) || '/live';
    
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    logger.debug({ instanceId, endpoint }, 'Fetching agent data');
    const data = await ssmAgentService.fetchAgentData(instanceId, endpoint);
    res.json(data);
  }),

  // Get machine ID from agent
  getMachineId: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    logger.debug({ instanceId }, 'Getting machine ID');
    try {
      const machineId = await ssmAgentService.getMachineId(instanceId);
      res.json({ machineId });
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Failed to get machine ID');
      // Return the actual error message instead of letting it go to error handler
      res.status(500).json({ 
        error: error.message || 'Failed to get machine ID',
        message: error.message || 'Failed to get machine ID',
      });
    }
  }),

  // Set AWS config on agent
  setAwsConfig: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.body;
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId is required in request body' });
      return;
    }

    logger.info({ instanceId }, 'Setting AWS config on agent');
    const result = await ssmAgentService.setAwsConfig(instanceId);
    res.json(result);
  }),

  // Validate S3 config on agent
  validateS3Config: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      res.status(400).json({ error: 'instanceId query parameter is required' });
      return;
    }

    logger.debug({ instanceId }, 'Validating S3 config');
    try {
      const result = await ssmAgentService.validateS3Config(instanceId);
      // Always return 200 with the status object (even if valid: false)
      // This allows the frontend to display the errors array
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Unexpected error validating S3 config');
      // Return error status object in the same format
      res.status(200).json({
        valid: false,
        errors: [error.message || 'Unexpected error validating S3 configuration'],
      });
    }
  }),
});

