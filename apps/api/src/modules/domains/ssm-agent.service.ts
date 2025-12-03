import {
  SendCommandCommand,
  SSMClient,
  GetCommandInvocationCommand,
  DescribeInstanceInformationCommand,
} from '@aws-sdk/client-ssm';
import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { logger } from '../../core/logger/index.js';
import { BadRequestError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { getEc2InstanceId } from '../../shared/aws/ec2-instance-detection.js';

export interface SSMAgentStatus {
  isInstalled: boolean;
  isRunning: boolean;
  installationInProgress?: boolean;
  installationCommandId?: string;
}

export class SSMAgentService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async buildSSMClient(): Promise<SSMClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings) {
      logger.error('Server settings not found');
      throw new BadRequestError('Server settings not configured. Please configure AWS credentials in AWS Settings.');
    }
    
    if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
      logger.error('AWS credentials missing from server settings');
      throw new BadRequestError('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';
    logger.debug({ region, hasCredentials: !!serverSettings.awsAccessKeyId }, 'Building SSM client');

    return new SSMClient({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Resolve instance ID - try provided, then auto-detect
   */
  private async resolveInstanceId(instanceId?: string): Promise<string> {
    if (instanceId) return instanceId;
    
      try {
      const detected = await Promise.race([
          getEc2InstanceId(),
          new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);

      if (detected) return detected;
      } catch (error) {
        logger.debug({ err: error }, 'Failed to auto-detect EC2 instance ID');
    }

      const errorMsg = 
        'EC2 instance ID not found. Please provide an instance ID as a query parameter (e.g., ?instanceId=i-1234567890abcdef0), ' +
        'or ensure this service is running on an EC2 instance with instance metadata available.';
    logger.error({ instanceId }, errorMsg);
      throw new BadRequestError(errorMsg);
    }

  /**
   * Check if SSM agent is installed and running on the instance
   * 
   * Uses DescribeInstanceInformationCommand which is more reliable than sending test commands.
   * This checks if the instance is registered with SSM, which indicates the agent is installed.
   * The PingStatus indicates if the agent is currently running and responding.
   */
  async checkAgentStatus(instanceId?: string): Promise<SSMAgentStatus> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);

    try {
      const client = await this.buildSSMClient();

      // Use DescribeInstanceInformationCommand to check if instance is registered with SSM
      const info = await client.send(
        new DescribeInstanceInformationCommand({
          Filters: [
            {
              Key: 'InstanceIds',
              Values: [targetInstanceId],
            },
          ],
          }),
        );

      const entry = info.InstanceInformationList?.find(
        (item) => item.InstanceId === targetInstanceId,
      );

      // If instance is not found in SSM, agent is not installed
      if (!entry) {
        logger.debug({ instanceId: targetInstanceId }, 'Instance not found in SSM - agent not installed');
        return {
          isInstalled: false,
          isRunning: false,
        };
      }

      // AWS PingStatus values: Online | ConnectionLost | Inactive
      // Online = agent is running and responding
      // ConnectionLost/Inactive = agent is installed but not running
      const isRunning = entry.PingStatus === 'Online';

      logger.debug(
        { instanceId: targetInstanceId, pingStatus: entry.PingStatus, isRunning },
        'SSM agent status checked',
      );

      return {
        isInstalled: true,
        isRunning,
      };
    } catch (error) {
      logger.error({ err: error, instanceId: targetInstanceId }, 'Failed to check SSM agent status');
      throw error;
    }
  }

  /**
   * Check instance state and IAM role via EC2 API before attempting SSM operations
   */
  private async checkInstanceState(instanceId: string): Promise<{ 
    state: string; 
    exists: boolean;
    iamRole?: string;
    iamInstanceProfileArn?: string;
  }> {
    try {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured');
      }

      const region = serverSettings.awsRegion ?? 'us-east-1';
      const ec2Client = new EC2Client({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });

      const response = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      const instance = response.Reservations?.[0]?.Instances?.[0];
      if (!instance) {
        return { state: 'not-found', exists: false };
      }

      // Check IAM role / instance profile
      const iamInstanceProfile = instance.IamInstanceProfile;
      const iamRole = iamInstanceProfile?.Arn?.split('/').pop();
      const iamInstanceProfileArn = iamInstanceProfile?.Arn;

      return { 
        state: instance.State?.Name ?? 'unknown', 
        exists: true,
        iamRole,
        iamInstanceProfileArn,
      };
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to check instance state via EC2 API');
      return { state: 'unknown', exists: false };
    }
  }

  /**
   * Install SSM agent using SSM Run Command
   * 
   * IMPORTANT: This method can only work if the SSM agent is ALREADY installed and running.
   * If the agent is completely missing, SSM commands will fail because there's no agent
   * to receive the command.
   * 
   * What this method does:
   * - If agent is installed but stopped → starts it
   * - If agent is installed and running → updates/reinstalls it
   * - If agent is missing → will fail (need alternative installation method)
   * 
   * For instances without SSM agent, install it via:
   * - EC2 user-data/bootstrap script at launch
   * - EC2 Instance Connect API (if available)
   * - Manual SSH access
   */
  async installAgent(instanceId?: string): Promise<{ commandId: string; status: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);

    // First, check instance state and IAM role via EC2 API
    const instanceState = await this.checkInstanceState(targetInstanceId);
    if (!instanceState.exists) {
      throw new Error(`Instance ${targetInstanceId} not found in EC2. Please verify the instance ID.`);
      }
    if (instanceState.state !== 'running') {
      throw new Error(
        `Instance ${targetInstanceId} is in state '${instanceState.state}'. ` +
        `SSM commands can only be sent to instances in 'running' state.`,
      );
    }
    
    // Check if instance has an IAM role
    if (!instanceState.iamRole && !instanceState.iamInstanceProfileArn) {
      logger.warn(
        { instanceId: targetInstanceId },
        'Instance does not have an IAM role attached. SSM agent cannot register without an IAM role.',
      );
    }

    try {
      const client = await this.buildSSMClient();

      logger.info({ instanceId: targetInstanceId, instanceState: instanceState.state }, 'Sending SSM agent install/update command');

      const command = new SendCommandCommand({
        InstanceIds: [targetInstanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Install or update SSM Agent',
        Parameters: {
          commands: [
            'echo Installing/updating SSM Agent...',
            // Try to install (idempotent - will do nothing if already installed)
            'yum install -y amazon-ssm-agent 2>/dev/null || apt-get update && apt-get install -y amazon-ssm-agent 2>/dev/null || true',
            // Enable and start the service
            'systemctl enable amazon-ssm-agent 2>/dev/null || true',
            'systemctl restart amazon-ssm-agent 2>/dev/null || systemctl start amazon-ssm-agent 2>/dev/null || true',
            // Verify installation
            'sleep 3',
            'if systemctl is-active --quiet amazon-ssm-agent; then echo "SSM_AGENT_INSTALLED_AND_RUNNING"; else echo "SSM_AGENT_INSTALLED_BUT_NOT_RUNNING"; fi',
            'echo SSM Agent installation/update complete.',
          ],
        },
        TimeoutSeconds: 300, // 5 minutes timeout
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM. The SSM agent may not be installed on the instance.');
      }

      logger.info({ instanceId: targetInstanceId, commandId }, 'SSM agent install/update command sent successfully');

      return {
        commandId,
        status: 'InProgress',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if error indicates agent is not installed or instance not registered with SSM
      if (
        errorMessage.includes('InvalidInstanceId') ||
        errorMessage.includes('not registered') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('not in a valid state for account')
      ) {
        logger.error(
          { err: error, instanceId: targetInstanceId, instanceState: instanceState.state },
          'Instance not registered with SSM. SSM agent must be installed and the instance must have proper IAM role.',
        );
        
        // Provide helpful error message
        let helpfulMessage = `Instance ${targetInstanceId} is not registered with SSM. `;
        helpfulMessage += `\n\nInstance details:\n`;
        helpfulMessage += `- State: ${instanceState.state}\n`;
        helpfulMessage += `- IAM Role: ${instanceState.iamRole || 'NOT ATTACHED'}\n`;
        
        helpfulMessage += `\nWhy this happens:\n`;
        helpfulMessage += `Your AWS credentials have access, BUT SSM Run Command requires:\n`;
        helpfulMessage += `1. SSM agent must be INSTALLED and RUNNING on the instance\n`;
        helpfulMessage += `2. Instance must have an IAM ROLE (not just user credentials) with 'AmazonSSMManagedInstanceCore' policy\n`;
        helpfulMessage += `3. SSM agent uses the INSTANCE'S IAM role to register with AWS SSM service\n`;
        
        helpfulMessage += `\nWhy SSM Run Command can't install SSM agent:\n`;
        helpfulMessage += `- SSM Run Command sends commands TO the SSM agent on the instance\n`;
        helpfulMessage += `- If SSM agent isn't installed, there's nothing to receive the command\n`;
        helpfulMessage += `- This is a chicken-and-egg problem: you need SSM agent to use SSM Run Command\n`;
        
        helpfulMessage += `\nTo fix this:\n`;
        if (!instanceState.iamRole) {
          helpfulMessage += `⚠️ CRITICAL: Instance has NO IAM role attached.\n`;
          helpfulMessage += `- Attach an IAM role with 'AmazonSSMManagedInstanceCore' policy to the instance\n`;
          helpfulMessage += `- Even if SSM agent is installed, it cannot register without an IAM role\n`;
        }
        helpfulMessage += `- Install SSM agent via:\n`;
        helpfulMessage += `  • EC2 user-data script (at instance launch)\n`;
        helpfulMessage += `  • EC2 Instance Connect API (if enabled - we can implement this)\n`;
        helpfulMessage += `  • SSH access (if you have SSH keys)\n`;
        helpfulMessage += `- For Amazon Linux 2/Ubuntu: SSM agent may be pre-installed but needs IAM role to register`;
        
        throw new Error(helpfulMessage);
      }

      logger.error({ err: error, instanceId: targetInstanceId, instanceState: instanceState.state }, 'Failed to send SSM command');
      throw error;
    }
  }

  /**
   * Start the SSM agent if it's installed but not running
   */
  async startAgent(instanceId?: string): Promise<{ commandId: string; status: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);

    // Check current status first
    const status = await this.checkAgentStatus(targetInstanceId);

    if (!status.isInstalled) {
      throw new Error(
        'SSM Agent is not installed. Cannot start it using SSM. Install via EC2 user-data or SSH.',
      );
    }

    if (status.isRunning) {
      logger.info({ instanceId: targetInstanceId }, 'SSM agent is already running');
      return { commandId: 'NONE', status: 'AlreadyRunning' };
    }

    try {
      const client = await this.buildSSMClient();

      logger.info({ instanceId: targetInstanceId }, 'Sending SSM agent start command');

      const startCommands = [
        'echo Starting SSM Agent...',
        // Handle multiple Linux variants:
        'systemctl daemon-reload || true',
        'systemctl start amazon-ssm-agent.service 2>/dev/null || true',
        'systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service 2>/dev/null || true',
        'service amazon-ssm-agent start 2>/dev/null || true',
        'sleep 2',
        'systemctl is-active --quiet amazon-ssm-agent && echo "SSM_AGENT_STARTED" || echo "SSM_AGENT_FAILED"',
      ];

      const command = new SendCommandCommand({
        InstanceIds: [targetInstanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Start SSM Agent',
        Parameters: {
          commands: startCommands,
        },
        TimeoutSeconds: 120,
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to send SSM start command.');
      }

      logger.info({ instanceId: targetInstanceId, commandId }, 'SSM agent start command sent successfully');

      return {
        commandId,
        status: 'InProgress',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (
        errorMessage.includes('InvalidInstanceId') ||
        errorMessage.includes('not registered') ||
        errorMessage.includes('does not exist')
      ) {
        logger.error(
          { err: error, instanceId: targetInstanceId },
          'SSM agent is not installed on the instance.',
        );
        throw new Error(
          'SSM agent is not installed on this instance. Cannot start it via SSM. Please install the agent first.',
        );
      }

      logger.error({ err: error, instanceId: targetInstanceId }, 'Failed to send SSM start command');
      throw error;
    }
  }

  /**
   * Check the status of a command execution
   */
  async checkInstallationStatus(commandId: string, instanceId?: string): Promise<{
    status: string;
    output?: string;
    error?: string;
  }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);

    try {
      const client = await this.buildSSMClient();

      const invocationResponse = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: targetInstanceId,
        }),
      );

      const status = invocationResponse.Status ?? 'Unknown';
      const output = invocationResponse.StandardOutputContent;
      const error = invocationResponse.StandardErrorContent;

      return {
        status,
        output: output?.trim(),
        error: error?.trim(),
      };
    } catch (error) {
      logger.error({ err: error, commandId, instanceId: targetInstanceId }, 'Failed to check command status');
      throw error;
    }
  }

  /**
   * Alias for checkInstallationStatus for backward compatibility
   * Can be used to check any command result
   */
  async getCommandResult(commandId: string, instanceId?: string): Promise<{
    status: string;
    output?: string;
    error?: string;
  }> {
    return this.checkInstallationStatus(commandId, instanceId);
  }
}

