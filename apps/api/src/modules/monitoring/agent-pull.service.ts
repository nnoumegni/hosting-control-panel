import {
  SendCommandCommand,
  SSMClient,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';
import { logger } from '../../core/logger/index.js';
import { BadRequestError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import type { SystemMetrics } from './monitoring.repository.js';

export interface AgentStatusResponse {
  version: string;
  status: 'online' | 'offline';
  metrics: SystemMetrics;
  blockedIps?: string[];
  uptime: number;
  webServer?: string;
  logs?: string[];
  logsCount?: number;
}

export class AgentPullService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async buildSSMClient(): Promise<SSMClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings) {
      throw new BadRequestError('Server settings not configured.');
    }

    if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
      throw new BadRequestError('AWS credentials not configured.');
    }

    return new SSMClient({
      region: serverSettings.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Pull agent status and metrics from EC2 instance via SSM
   */
  async pullAgentStatus(instanceId: string): Promise<AgentStatusResponse | null> {
    const client = await this.buildSSMClient();

    // Use SSM to query the agent's local API endpoint
    // The agent should expose a simple HTTP endpoint on localhost
    // Check if agent service is running first, then query the API
    // Also check service logs if it fails
    const command = `if systemctl is-active --quiet jetcamer-monitoring-agent; then 
  curl -s --max-time 5 http://127.0.0.1:9876/status 2>/dev/null || (echo "AGENT_API_NOT_RESPONDING" && journalctl -u jetcamer-monitoring-agent -n 5 --no-pager 2>&1 | tail -5)
else 
  echo "AGENT_NOT_RUNNING"
  systemctl status jetcamer-monitoring-agent --no-pager 2>&1 | head -10
fi`;

    logger.debug({ instanceId }, 'Pulling agent status via SSM');

    try {
      const sendResponse = await client.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: [command],
          },
          TimeoutSeconds: 30,
        }),
      );

      if (!sendResponse.Command?.CommandId) {
        throw new Error('Failed to send SSM command');
      }

      // Poll for command completion (up to 10 attempts with 2 second intervals)
      let invocation;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        invocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: sendResponse.Command.CommandId,
            InstanceId: instanceId,
          }),
        );

        // Break if command has completed (success or failure)
        if (invocation.Status === 'Success' || invocation.Status === 'Failed' || invocation.Status === 'Cancelled' || invocation.Status === 'TimedOut') {
          break;
        }
        
        attempts++;
      }

      if (!invocation) {
        logger.warn({ instanceId }, 'Failed to get command invocation after polling');
        return null;
      }

      if (invocation.Status !== 'Success') {
        logger.warn({ 
          instanceId, 
          status: invocation.Status,
          standardOutput: invocation.StandardOutputContent?.substring(0, 500),
          standardError: invocation.StandardErrorContent?.substring(0, 500),
        }, 'SSM command did not succeed');
        return null;
      }

      const output = invocation.StandardOutputContent?.trim() || '';
      const errorOutput = invocation.StandardErrorContent?.trim() || '';
      
      logger.info({ 
        instanceId, 
        outputLength: output.length,
        outputPreview: output.substring(0, 300),
        errorOutputPreview: errorOutput.substring(0, 300),
        status: invocation.Status 
      }, 'Agent pull SSM command response');
      
      // Check for various error conditions
      if (!output) {
        logger.warn({ instanceId, errorOutput }, 'No output from SSM command');
        return null;
      }
      
      if (output.startsWith('AGENT_NOT_RUNNING') || output.includes('inactive')) {
        logger.warn({ instanceId, output: output.substring(0, 500) }, 'Agent service is not running on instance');
        return null;
      }
      
      if (output.includes('AGENT_API_NOT_RESPONDING') || output.includes('Connection refused')) {
        logger.warn({ instanceId, output: output.substring(0, 500) }, 'Agent service is running but API endpoint is not responding');
        return null;
      }

      try {
        const status = JSON.parse(output) as AgentStatusResponse;
        logger.debug({ instanceId, version: status.version }, 'Successfully pulled agent status');
        return status;
      } catch (parseError) {
        logger.error({ instanceId, output, errorOutput, err: parseError }, 'Failed to parse agent status');
        return null;
      }
    } catch (error: any) {
      logger.error({ instanceId, err: error }, 'Failed to pull agent status via SSM');
      return null;
    }
  }

  /**
   * Pull agent metrics (same as status but more focused)
   */
  async pullAgentMetrics(instanceId: string): Promise<SystemMetrics | null> {
    const status = await this.pullAgentStatus(instanceId);
    return status?.metrics || null;
  }

  /**
   * Check if agent is running on the instance
   */
  async isAgentRunning(instanceId: string): Promise<boolean> {
    const status = await this.pullAgentStatus(instanceId);
    return status?.status === 'online';
  }

  /**
   * Pull recent log events from agent
   */
  async pullLogEvents(instanceId: string, limit = 50, since?: Date): Promise<Array<{
    ip: string;
    path: string;
    status: number;
    method?: string;
    userAgent?: string;
    raw: string;
    timestamp: string;
  }>> {
    const client = await this.buildSSMClient();

    // Build curl command with optional query params
    let url = 'http://127.0.0.1:9876/logs?limit=' + limit;
    if (since) {
      url += '&since=' + encodeURIComponent(since.toISOString());
    }
    
    const command = `if systemctl is-active --quiet jetcamer-monitoring-agent; then 
  curl -s --max-time 5 ${url} 2>/dev/null || echo "AGENT_API_NOT_RESPONDING"
else 
  echo "AGENT_NOT_RUNNING"
fi`;

    logger.debug({ instanceId, url }, 'Pulling log events via SSM');

    try {
      const sendResponse = await client.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: [command],
          },
          TimeoutSeconds: 30,
        }),
      );

      if (!sendResponse.Command?.CommandId) {
        throw new Error('Failed to send SSM command');
      }

      // Poll for command completion
      let invocation;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        invocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: sendResponse.Command.CommandId,
            InstanceId: instanceId,
          }),
        );

        if (invocation.Status === 'Success' || invocation.Status === 'Failed' || invocation.Status === 'Cancelled' || invocation.Status === 'TimedOut') {
          break;
        }
        
        attempts++;
      }

      if (!invocation || invocation.Status !== 'Success') {
        logger.warn({ instanceId, status: invocation?.Status }, 'Failed to pull log events');
        return [];
      }

      const output = invocation.StandardOutputContent?.trim() || '';
      const errorOutput = invocation.StandardErrorContent?.trim() || '';
      
      logger.info({ 
        instanceId, 
        outputLength: output.length,
        outputPreview: output.substring(0, 500),
        errorOutputPreview: errorOutput.substring(0, 500),
        status: invocation.Status 
      }, 'Agent /logs endpoint response');
      
      if (output === 'AGENT_NOT_RUNNING' || output === 'AGENT_API_NOT_RESPONDING' || !output) {
        logger.warn({ instanceId, output, errorOutput }, 'Agent not running or not responding to /logs endpoint');
        return [];
      }

      try {
        const response = JSON.parse(output);
        const events = response.events || [];
        const total = response.total || 0;
        logger.info({ instanceId, eventsCount: events.length, total }, 'Successfully pulled log events from agent');
        return events;
      } catch (parseError) {
        logger.error({ instanceId, output: output.substring(0, 500), errorOutput, err: parseError }, 'Failed to parse log events JSON');
        return [];
      }
    } catch (error: any) {
      logger.error({ instanceId, err: error }, 'Failed to pull log events via SSM');
      return [];
    }
  }
}

