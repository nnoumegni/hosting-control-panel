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
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

const AGENT_INSTALL_URL = process.env.CYBER_AGENT_INSTALL_URL || 'https://api.jetcamer.com/cyber-agent/install.sh';
const AGENT_UNINSTALL_URL = process.env.CYBER_AGENT_UNINSTALL_URL || 'https://api.jetcamer.com/cyber-agent/uninstall.sh';
const AGENT_API_PORT = 9811;

export interface AgentStatus {
  isInstalled: boolean;
  isRunning: boolean;
  installationInProgress?: boolean;
  installationCommandId?: string;
}

export interface InstallationResult {
  commandId: string;
  status: string;
}

export interface CommandStatus {
  status: string;
  output?: string;
  error?: string;
}

export class SSMAgentService {
  private ssmClient: SSMClient | null = null;
  private ec2Client: EC2Client | null = null;
  private s3Client: S3Client | null = null;

  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async getSSMClient(): Promise<SSMClient> {
    if (!this.ssmClient) {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings) {
        throw new Error('Server settings not found. Please configure AWS credentials in AWS Settings.');
      }
      
      if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
      }

      const region = serverSettings.awsRegion || 'us-east-1';

      this.ssmClient = new SSMClient({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });
    }
    return this.ssmClient;
  }

  private async getEC2Client(): Promise<EC2Client> {
    if (!this.ec2Client) {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings) {
        throw new Error('Server settings not found. Please configure AWS credentials in AWS Settings.');
      }
      
      if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
      }

      const region = serverSettings.awsRegion || 'us-east-1';

      this.ec2Client = new EC2Client({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });
    }
    return this.ec2Client;
  }

  private async getS3Client(): Promise<S3Client> {
    if (!this.s3Client) {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings) {
        throw new Error('Server settings not found. Please configure AWS credentials in AWS Settings.');
      }
      
      if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
      }

      const region = serverSettings.awsRegion || 'us-east-1';

      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });
    }
    return this.s3Client;
  }

  /**
   * Fetch content from S3 URL (used when SSM output exceeds size limit)
   */
  private async fetchFromS3(s3Url: string): Promise<string> {
    try {
      // Parse S3 URL: https://s3.region.amazonaws.com/bucket/key or s3://bucket/key
      let bucket: string;
      let key: string;

      if (s3Url.startsWith('s3://')) {
        const match = s3Url.match(/^s3:\/\/([^\/]+)\/(.+)$/);
        if (!match) {
          throw new Error(`Invalid S3 URL format: ${s3Url}`);
        }
        bucket = match[1];
        key = match[2];
      } else {
        // Parse https://s3.region.amazonaws.com/bucket/key or https://bucket.s3.region.amazonaws.com/key
        const url = new URL(s3Url);
        if (url.hostname.includes('.s3.') || url.hostname.includes('s3-')) {
          // Format: bucket.s3.region.amazonaws.com or s3.region.amazonaws.com/bucket
          const parts = url.pathname.split('/').filter(Boolean);
          if (url.hostname.startsWith('s3.') || url.hostname.includes('.s3.')) {
            // s3.region.amazonaws.com/bucket/key
            bucket = parts[0];
            key = parts.slice(1).join('/');
          } else {
            // bucket.s3.region.amazonaws.com/key
            bucket = url.hostname.split('.')[0];
            key = parts.join('/');
          }
        } else {
          throw new Error(`Unsupported S3 URL format: ${s3Url}`);
        }
      }

      const s3Client = await this.getS3Client();
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await s3Client.send(command);
      if (!response.Body) {
        throw new Error('S3 object body is empty');
      }

      // Convert stream to string
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      return buffer.toString('utf-8');
    } catch (error) {
      console.error('Failed to fetch from S3:', error);
      throw new Error(`Failed to fetch output from S3: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if SSM agent is installed and running on the instance
   */
  async checkSSMAgentStatus(instanceId: string): Promise<{ isInstalled: boolean; isRunning: boolean }> {
    try {
      const client = await this.getSSMClient();

      const info = await client.send(
        new DescribeInstanceInformationCommand({
          Filters: [
            {
              Key: 'InstanceIds',
              Values: [instanceId],
            },
          ],
        }),
      );

      const entry = info.InstanceInformationList?.find(
        (item) => item.InstanceId === instanceId,
      );

      if (!entry) {
        return {
          isInstalled: false,
          isRunning: false,
        };
      }

      const isRunning = entry.PingStatus === 'Online';

      return {
        isInstalled: true,
        isRunning,
      };
    } catch (error) {
      console.error('Failed to check SSM agent status:', error);
      throw error;
    }
  }

  /**
   * Check instance state and IAM role
   */
  private async checkInstanceState(instanceId: string): Promise<{
    state: string;
    exists: boolean;
    iamRole?: string;
  }> {
    try {
      const ec2Client = await this.getEC2Client();

      const response = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      const instance = response.Reservations?.[0]?.Instances?.[0];
      if (!instance) {
        return { state: 'not-found', exists: false };
      }

      const iamInstanceProfile = instance.IamInstanceProfile;
      const iamRole = iamInstanceProfile?.Arn?.split('/').pop();

      return {
        state: instance.State?.Name ?? 'unknown',
        exists: true,
        iamRole,
      };
    } catch (error) {
      console.error('Failed to check instance state:', error);
      return { state: 'unknown', exists: false };
    }
  }

  /**
   * Check if cyber-agent is installed and running
   */
  async checkAgentStatus(instanceId: string): Promise<AgentStatus> {
    // First check if SSM agent is available
    const ssmStatus = await this.checkSSMAgentStatus(instanceId);
    if (!ssmStatus.isInstalled || !ssmStatus.isRunning) {
      return {
        isInstalled: false,
        isRunning: false,
      };
    }

    // Check if cyber-agent is installed by checking if the service exists
    try {
      const client = await this.getSSMClient();

      const command = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Check cyber-agent status',
        Parameters: {
          commands: [
            'systemctl is-active --quiet jetcamer-agent && echo "RUNNING" || echo "NOT_RUNNING"',
            'systemctl is-enabled --quiet jetcamer-agent && echo "ENABLED" || echo "NOT_ENABLED"',
            'test -f /opt/jetcamer-agent/jetcamer-agent && echo "INSTALLED" || echo "NOT_INSTALLED"',
          ],
        },
        TimeoutSeconds: 30,
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        return {
          isInstalled: false,
          isRunning: false,
        };
      }

      // Wait a bit and check the result
      await new Promise(resolve => setTimeout(resolve, 2000));

      const invocation = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }),
      );

      const output = invocation.StandardOutputContent || '';
      const lines = output.trim().split('\n');
      const isRunning = lines[0]?.includes('RUNNING') || false;
      const isInstalled = lines[2]?.includes('INSTALLED') || false;

      return {
        isInstalled,
        isRunning,
      };
    } catch (error) {
      console.error('Failed to check agent status:', error);
      return {
        isInstalled: false,
        isRunning: false,
      };
    }
  }

  /**
   * Install cyber-agent using SSM
   */
  async installAgent(instanceId: string): Promise<InstallationResult> {
    // Check instance state
    const instanceState = await this.checkInstanceState(instanceId);
    if (!instanceState.exists) {
      throw new Error(`Instance ${instanceId} not found in EC2.`);
    }
    if (instanceState.state !== 'running') {
      throw new Error(
        `Instance ${instanceId} is in state '${instanceState.state}'. ` +
        `SSM commands can only be sent to instances in 'running' state.`,
      );
    }

    // Check if SSM agent is available
    const ssmStatus = await this.checkSSMAgentStatus(instanceId);
    if (!ssmStatus.isInstalled || !ssmStatus.isRunning) {
      throw new Error(
        `SSM agent is not installed or not running on instance ${instanceId}. ` +
        `Please install SSM agent first.`,
      );
    }

    try {
      const client = await this.getSSMClient();

      const command = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Install cyber-agent',
        Parameters: {
          commands: [
            // Download script first, then execute to get better error messages
            `set -e`,
            `echo "Checking internet connectivity..."`,
            `ping -c 1 8.8.8.8 > /dev/null 2>&1 || { echo "ERROR: No internet connectivity. Cannot download install script."; exit 1; }`,
            `echo "Downloading install script from ${AGENT_INSTALL_URL}..."`,
            `curl -fSL --connect-timeout 10 --max-time 30 ${AGENT_INSTALL_URL} -o /tmp/install-agent.sh 2>&1 || { echo "ERROR: Failed to download install script. curl exit code: $?"; echo "This usually means:"; echo "  - The instance cannot reach the internet"; echo "  - DNS resolution is failing"; echo "  - The download URL is unreachable"; exit 1; }`,
            `chmod +x /tmp/install-agent.sh`,
            `echo "Running install script..."`,
            `sudo bash /tmp/install-agent.sh 2>&1 || { echo "ERROR: Install script failed. Exit code: $?"; exit 1; }`,
            `echo "Installation completed successfully"`,
          ],
        },
        TimeoutSeconds: 600, // 10 minutes timeout
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM.');
      }

      return {
        commandId,
        status: 'InProgress',
      };
    } catch (error) {
      console.error('Failed to install agent:', error);
      throw error;
    }
  }

  /**
   * Uninstall cyber-agent using SSM
   */
  async uninstallAgent(instanceId: string): Promise<InstallationResult> {
    // Check instance state
    const instanceState = await this.checkInstanceState(instanceId);
    if (!instanceState.exists) {
      throw new Error(`Instance ${instanceId} not found in EC2.`);
    }
    if (instanceState.state !== 'running') {
      throw new Error(
        `Instance ${instanceId} is in state '${instanceState.state}'. ` +
        `SSM commands can only be sent to instances in 'running' state.`,
      );
    }

    // Check if SSM agent is available
    const ssmStatus = await this.checkSSMAgentStatus(instanceId);
    if (!ssmStatus.isInstalled || !ssmStatus.isRunning) {
      throw new Error(
        `SSM agent is not installed or not running on instance ${instanceId}. ` +
        `Cannot uninstall cyber-agent via SSM.`,
      );
    }

    try {
      const client = await this.getSSMClient();

      const command = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Uninstall cyber-agent',
        Parameters: {
          commands: [
            `curl -fsSL ${AGENT_UNINSTALL_URL} | sudo bash`,
          ],
        },
        TimeoutSeconds: 300, // 5 minutes timeout
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM.');
      }

      return {
        commandId,
        status: 'InProgress',
      };
    } catch (error) {
      console.error('Failed to uninstall agent:', error);
      throw error;
    }
  }

  /**
   * Check the status of a command execution
   */
  async checkCommandStatus(commandId: string, instanceId: string): Promise<CommandStatus> {
    try {
      const client = await this.getSSMClient();

      const invocationResponse = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
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
      console.error('Failed to check command status:', error);
      throw error;
    }
  }

  /**
   * Test connectivity and diagnose issues
   */
  async testConnectivity(instanceId: string): Promise<{ output: string; error: string }> {
    try {
      const client = await this.getSSMClient();

      const command = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Test connectivity and diagnose issues',
        Parameters: {
          commands: [
            `echo "=== Testing Internet Connectivity ==="`,
            `ping -c 2 8.8.8.8 2>&1 || echo "Ping failed"`,
            `echo ""`,
            `echo "=== Testing DNS Resolution ==="`,
            `nslookup api.jetcamer.com 2>&1 || echo "DNS lookup failed"`,
            `echo ""`,
            `echo "=== Testing curl to install URL ==="`,
            `curl -v --connect-timeout 5 --max-time 10 https://api.jetcamer.com/cyber-agent/install.sh 2>&1 | head -20 || echo "curl failed with exit code: $?"`,
            `echo ""`,
            `echo "=== Checking curl version ==="`,
            `curl --version 2>&1 || echo "curl not found"`,
            `echo ""`,
            `echo "=== Network interfaces ==="`,
            `ip addr show 2>&1 | head -10 || ifconfig 2>&1 | head -10 || echo "Cannot list network interfaces"`,
          ],
        },
        TimeoutSeconds: 30,
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM.');
      }

      // Wait for command to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const invocation = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }),
      );

      return {
        output: invocation.StandardOutputContent || '',
        error: invocation.StandardErrorContent || '',
      };
    } catch (error) {
      console.error('Failed to test connectivity:', error);
      throw error;
    }
  }

  /**
   * Get the public IP address of an EC2 instance
   */
  async getInstancePublicIp(instanceId: string): Promise<string | null> {
    try {
      const ec2Client = await this.getEC2Client();

      const response = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      const instance = response.Reservations?.[0]?.Instances?.[0];
      if (!instance) {
        logger.warn({ instanceId }, 'Instance not found in EC2');
        return null;
      }

      // Try public IP first, then Elastic IP association
      const publicIp = instance.PublicIpAddress || 
                       instance.NetworkInterfaces?.[0]?.Association?.PublicIp;

      if (publicIp) {
        logger.debug({ instanceId, publicIp }, 'Retrieved public IP from EC2 API');
        return publicIp;
      }

      logger.warn({ instanceId }, 'No public IP found for instance');
      return null;
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to get public IP from EC2 API');
      throw error;
    }
  }

  /**
   * Fetch data directly from the agent's HTTP API endpoint
   * Makes a direct HTTP request to http://{publicIp}:9811{endpoint}
   */
  async fetchAgentDataDirect(instanceId: string, endpoint: string = '/live/summary'): Promise<any> {
    const publicIp = await this.getInstancePublicIp(instanceId);
    if (!publicIp) {
      throw new Error('Could not determine public IP address for the instance');
    }

    const url = `http://${publicIp}:${AGENT_API_PORT}${endpoint}`;
    logger.debug({ instanceId, publicIp, url }, 'Fetching data directly from agent HTTP endpoint');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(30000), // 30 seconds
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Agent HTTP endpoint returned ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      logger.debug({ instanceId, publicIp, dataKeys: Object.keys(data || {}) }, 'Successfully fetched data from agent HTTP endpoint');
      return data;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error('Request to agent HTTP endpoint timed out');
      }
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Failed to fetch')) {
        throw new Error(`Could not connect to agent at ${url}. Make sure the agent is running and port ${AGENT_API_PORT} is accessible.`);
      }
      logger.error({ err: error, instanceId, publicIp, url }, 'Failed to fetch data from agent HTTP endpoint');
      throw error;
    }
  }

  /**
   * Fetch live data from the agent via SSM
   * Uses the same approach as the demo dashboard: curl http://127.0.0.1:9811/live
   * @deprecated Use fetchAgentDataDirect instead
   */
  async fetchAgentData(instanceId: string, endpoint: string = '/live'): Promise<any> {
    // Check if SSM agent is available
    const ssmStatus = await this.checkSSMAgentStatus(instanceId);
    if (!ssmStatus.isInstalled || !ssmStatus.isRunning) {
      throw new Error('SSM agent is not available on the instance.');
    }

    try {
      const client = await this.getSSMClient();

      // Use curl to fetch JSON directly
      // The demo dashboard uses: fetch("http://127.0.0.1:9811/live")
      // We'll handle JSON parsing and repair on our side
      const curlCommand = `curl -s http://127.0.0.1:${AGENT_API_PORT}${endpoint}`;

      // Get region for S3 output configuration
      const serverSettings = await this.serverSettingsProvider.getSettings();
      const region = serverSettings?.awsRegion || 'us-east-1';
      
      // Configure S3 output for large responses
      // SSM has a limit of ~24,000 characters for StandardOutputContent
      // To avoid truncation, we need to explicitly set OutputS3BucketName
      const s3BucketName = process.env.SSM_OUTPUT_S3_BUCKET;
      const s3KeyPrefix = process.env.SSM_OUTPUT_S3_KEY_PREFIX || 'ssm-command-output';

      const commandConfig: any = {
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Fetch agent data',
        Parameters: {
          commands: [
            curlCommand,
          ],
        },
        TimeoutSeconds: 30,
        OutputS3Region: region,
      };

      // Explicitly set S3 bucket if configured (required for large outputs)
      if (s3BucketName) {
        commandConfig.OutputS3BucketName = s3BucketName;
        commandConfig.OutputS3KeyPrefix = s3KeyPrefix;
        console.log(`[fetchAgentData] S3 output configured: bucket=${s3BucketName}, prefix=${s3KeyPrefix}`);
      } else {
        console.warn('[fetchAgentData] SSM_OUTPUT_S3_BUCKET not set. Large outputs may be truncated. Set SSM_OUTPUT_S3_BUCKET environment variable to enable S3 output storage.');
      }

      const command = new SendCommandCommand(commandConfig);

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM.');
      }

      // Poll for command completion (SSM commands can take a few seconds)
      let status = 'InProgress';
      let attempts = 0;
      const maxAttempts = 15; // 15 attempts * 2 seconds = 30 seconds max

      while (status === 'InProgress' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;

        const invocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          }),
        );

        status = invocation.Status || 'Unknown';

        if (status === 'Success') {
          // SSM has a limit of ~2500 characters for StandardOutputContent
          // If output exceeds this, it's stored in S3 and StandardOutputUrl is provided
          let output = invocation.StandardOutputContent || '';
          const error = invocation.StandardErrorContent || '';
          
          // Log output size for debugging
          console.log(`[fetchAgentData] StandardOutputContent size: ${output.length} chars, Error size: ${error.length} chars`);
          console.log(`[fetchAgentData] StandardOutputUrl: ${invocation.StandardOutputUrl || 'none'}`);
          
          // If output is stored in S3 (large response), fetch it
          if (invocation.StandardOutputUrl) {
            console.log('[fetchAgentData] Large output detected - fetching from S3:', invocation.StandardOutputUrl);
            try {
              output = await this.fetchFromS3(invocation.StandardOutputUrl);
              console.log(`[fetchAgentData] Fetched from S3, size: ${output.length} chars`);
            } catch (s3Error) {
              console.error('[fetchAgentData] Failed to fetch from S3:', s3Error);
              throw new Error(`Failed to fetch large output from S3: ${s3Error instanceof Error ? s3Error.message : String(s3Error)}`);
            }
          } else {
            // Check for potential truncation
            // SSM typically truncates at ~24,000 characters
            // If output is close to this limit and doesn't end properly, it's likely truncated
            const SSM_OUTPUT_LIMIT = 24000;
            if (output.length >= SSM_OUTPUT_LIMIT * 0.9) { // 90% of limit
              const trimmedOutput = output.trim();
              // Check if JSON appears incomplete (doesn't end with })
              if (!trimmedOutput.endsWith('}')) {
                console.warn(`[fetchAgentData] Output may be truncated: ${output.length} chars, doesn't end with '}'`);
                console.warn(`[fetchAgentData] To fix: Set SSM_OUTPUT_S3_BUCKET environment variable to enable S3 output storage`);
                throw new Error(
                  `SSM output appears to be truncated (${output.length} chars, limit ~${SSM_OUTPUT_LIMIT}). ` +
                  `The response doesn't end with '}' indicating incomplete JSON. ` +
                  `Set SSM_OUTPUT_S3_BUCKET environment variable to store large outputs in S3.`
                );
              }
            }
          }

          if (error) {
            console.warn('SSM command stderr:', error);
          }

          const trimmedOutput = output.trim();
          
          if (!trimmedOutput) {
            throw new Error('SSM command returned empty output');
          }

          // Log the raw output for debugging (first 500 chars)
          console.log(`[fetchAgentData] SSM command output (first 500 chars):`, trimmedOutput.substring(0, 500));
          console.log(`[fetchAgentData] SSM command output length:`, trimmedOutput.length);
          console.log(`[fetchAgentData] SSM command output (last 200 chars):`, trimmedOutput.substring(Math.max(0, trimmedOutput.length - 200)));

          // Try to extract JSON if there's extra output
          let jsonString = trimmedOutput;
          
          // Look for JSON object boundaries
          const jsonStart = jsonString.indexOf('{');
          const jsonEnd = jsonString.lastIndexOf('}');
          
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
            if (jsonStart > 0 || jsonEnd < trimmedOutput.length - 1) {
              console.log(`[fetchAgentData] Extracted JSON from output (removed ${jsonStart} chars before, ${trimmedOutput.length - jsonEnd - 1} chars after)`);
            }
          }
          
          // Try to fix common JSON issues: unescaped control characters in strings
          // This is a best-effort fix for malformed JSON from the agent
          try {
            // Use a state machine to find and escape unescaped control characters in string values
            let fixed = '';
            let inString = false;
            let escapeNext = false;
            
            for (let i = 0; i < jsonString.length; i++) {
              const char = jsonString[i];
              const code = jsonString.charCodeAt(i);
              
              if (escapeNext) {
                fixed += char;
                escapeNext = false;
                continue;
              }
              
              if (char === '\\') {
                fixed += char;
                escapeNext = true;
                continue;
              }
              
              if (char === '"') {
                inString = !inString;
                fixed += char;
                continue;
              }
              
              if (inString) {
                // Inside a string - escape control characters
                if (code < 32 && char !== '\n' && char !== '\r' && char !== '\t') {
                  // Replace other control characters with \uXXXX
                  fixed += `\\u${code.toString(16).padStart(4, '0')}`;
                } else if (char === '\n') {
                  fixed += '\\n';
                } else if (char === '\r') {
                  fixed += '\\r';
                } else if (char === '\t') {
                  fixed += '\\t';
                } else {
                  fixed += char;
                }
              } else {
                fixed += char;
              }
            }
            
            // Only use fixed version if it's different (meaning we made changes)
            if (fixed !== jsonString) {
              console.log('[fetchAgentData] Attempted to fix JSON by escaping control characters');
              jsonString = fixed;
            }
          } catch (fixError) {
            console.warn('[fetchAgentData] Failed to pre-process JSON for fixes:', fixError);
            // Continue with original jsonString
          }

          try {
            const parsed = JSON.parse(jsonString);
            console.log(`[fetchAgentData] Successfully parsed JSON. Keys:`, Object.keys(parsed));
            return parsed;
          } catch (parseError) {
            // Try to repair JSON using jsonrepair if available
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const jsonrepairModule = await import('jsonrepair' as string).catch(() => null);
              if (jsonrepairModule) {
                const jsonrepair = (jsonrepairModule as any).jsonrepair || (jsonrepairModule as any).default;
                console.log('[fetchAgentData] Attempting to repair JSON using jsonrepair...');
                const repaired = jsonrepair(jsonString);
                const parsed = JSON.parse(repaired);
                console.log('[fetchAgentData] Successfully parsed repaired JSON');
                return parsed;
              }
            } catch (repairError) {
              console.log('[fetchAgentData] JSON repair failed or jsonrepair not available:', repairError instanceof Error ? repairError.message : String(repairError));
              // Continue with original error handling
            }
            // Find the position of the error in the JSON string
            const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
            const positionMatch = errorMsg.match(/position (\d+)/);
            const errorPosition = positionMatch ? parseInt(positionMatch[1], 10) : -1;
            
            let context = '';
            if (errorPosition > 0 && errorPosition < jsonString.length) {
              const start = Math.max(0, errorPosition - 200);
              const pointerPos = errorPosition - start;
              const char = jsonString[errorPosition];
              const charCode = jsonString.charCodeAt(errorPosition);
              const beforeContext = jsonString.substring(Math.max(0, errorPosition - 50), errorPosition);
              const afterContext = jsonString.substring(errorPosition, Math.min(jsonString.length, errorPosition + 50));
              
              context = `\nContext around error (position ${errorPosition}):\n...${beforeContext}>>>${char}<<<${afterContext}...\n${' '.repeat(pointerPos)}^ (char: "${char}" code: ${charCode}, hex: 0x${charCode.toString(16)})\n\nLooking backwards for unclosed strings/objects...`;
              
              // Try to find what might be wrong - check for unclosed strings or objects
              let quoteCount = 0;
              for (let i = Math.max(0, errorPosition - 1000); i < errorPosition; i++) {
                if (jsonString[i] === '"' && (i === 0 || jsonString[i - 1] !== '\\')) {
                  quoteCount++;
                }
              }
              if (quoteCount % 2 !== 0) {
                context += '\n⚠️  Detected unclosed string (odd number of unescaped quotes before error position)';
              }
            }
            
            // Try to find and fix common JSON issues
            // The error "Expected ',' or '}' after property value" usually means:
            // 1. Unescaped quote in a string breaking the JSON structure
            // 2. Missing comma between properties
            // 3. Missing closing brace
            
            // Try to fix unescaped quotes in string values
            // This is a common issue when log data contains quotes
            try {
              let fixedJson = jsonString;
              let fixAttempted = false;
              
              // Find strings and escape unescaped quotes inside them
              // This regex finds quoted strings and their content
              fixedJson = jsonString.replace(/"([^"\\]|\\.)*"/g, (match) => {
                // Check if this string contains unescaped quotes (shouldn't happen in valid JSON)
                // But if the agent is generating invalid JSON, we need to fix it
                const innerContent = match.slice(1, -1); // Remove surrounding quotes
                if (innerContent.includes('"') && !innerContent.match(/\\"/)) {
                  // Has unescaped quote - escape it
                  fixAttempted = true;
                  const escaped = innerContent.replace(/"/g, '\\"');
                  return `"${escaped}"`;
                }
                return match;
              });
              
              if (fixAttempted) {
                console.log('[fetchAgentData] Attempted to fix JSON by escaping unescaped quotes in strings');
                try {
                  const fixedParsed = JSON.parse(fixedJson);
                  console.log('[fetchAgentData] Successfully parsed fixed JSON');
                  return fixedParsed;
                } catch (fixParseError) {
                  console.log('[fetchAgentData] JSON fix attempt failed:', fixParseError);
                }
              }
            } catch (fixError) {
              console.warn('[fetchAgentData] Failed to attempt JSON fix:', fixError);
            }
            
            // Log full error details to console
            console.error('Failed to parse JSON output:', {
              error: errorMsg,
              outputLength: trimmedOutput.length,
              jsonLength: jsonString.length,
              errorPosition,
              firstChars: trimmedOutput.substring(0, 500),
              lastChars: trimmedOutput.substring(Math.max(0, trimmedOutput.length - 500)),
              context,
            });
            
            // For the error message, include context but truncate if too long
            let errorMessage = `Failed to parse agent response as JSON: ${errorMsg}`;
            if (context) {
              // Truncate context if it's too long (max 1000 chars)
              const truncatedContext = context.length > 1000 ? context.substring(0, 1000) + '...' : context;
              errorMessage += truncatedContext;
            }
            
            // Also include a hint about the issue
            if (errorMsg.includes("Expected ',' or '}'")) {
              errorMessage += '\n\nThis usually indicates malformed JSON from the agent, possibly due to unescaped quotes in log data.';
            }
            
            throw new Error(errorMessage);
          }
        } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
          const error = invocation.StandardErrorContent || 'Unknown error';
          throw new Error(`SSM command ${status}: ${error}`);
        }
      }

      if (status === 'InProgress') {
        throw new Error('SSM command timed out after 30 seconds');
      }

      throw new Error(`SSM command ended with unexpected status: ${status}`);
    } catch (error) {
      console.error('Failed to fetch agent data:', error);
      throw error;
    }
  }

  /**
   * Get machine ID from agent
   */
  async getMachineId(instanceId: string, autoSetCredentials: boolean = true): Promise<string> {
    const ssmStatus = await this.checkSSMAgentStatus(instanceId);
    if (!ssmStatus.isInstalled || !ssmStatus.isRunning) {
      throw new Error('SSM agent is not available on the instance.');
    }

    // Automatically set AWS credentials if we have them and autoSetCredentials is true
    if (autoSetCredentials) {
      try {
        const serverSettings = await this.serverSettingsProvider.getSettings();
        if (serverSettings?.awsAccessKeyId && serverSettings?.awsSecretAccessKey) {
          await this.setAwsConfig(instanceId);
          logger.debug({ instanceId }, 'Auto-set AWS credentials before getting machine ID');
        }
      } catch (configErr: any) {
        // Log but continue - getting machine ID doesn't require credentials
        logger.debug({ err: configErr, instanceId }, 'Failed to auto-set AWS config (continuing anyway)');
      }
    }

    try {
      const client = await this.getSSMClient();
      
      // First check if the agent is running on port 9811
      const checkAgentCommand = `curl -s --max-time 2 http://127.0.0.1:${AGENT_API_PORT}/health || echo "AGENT_NOT_RUNNING"`;
      const checkCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Check if agent is running',
        Parameters: {
          commands: [checkAgentCommand],
        },
        TimeoutSeconds: 30,
      });

      const checkResponse = await client.send(checkCommand);
      const checkCommandId = checkResponse.Command?.CommandId;

      if (checkCommandId) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const checkInvocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: checkCommandId,
            InstanceId: instanceId,
          }),
        );

        if (checkInvocation.StandardOutputContent?.includes('AGENT_NOT_RUNNING')) {
          throw new Error('JetCamer agent is not running on port 9811. Please ensure the agent is installed and running.');
        }
      }

      // Now get the machine ID
      const curlCommand = `curl -s --max-time 5 http://127.0.0.1:${AGENT_API_PORT}/internal/get-machine-id`;

      const command = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Get machine ID from agent',
        Parameters: {
          commands: [curlCommand],
        },
        TimeoutSeconds: 30,
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM.');
      }

      // Wait for command to complete with retries
      let attempts = 0;
      let invocation;
      while (attempts < 5) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        invocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          }),
        );

        if (invocation.Status === 'Success' || invocation.Status === 'Failed' || invocation.Status === 'TimedOut') {
          break;
        }
        attempts++;
      }

      if (!invocation || invocation.Status !== 'Success') {
        const errorMsg = invocation?.StandardErrorContent || invocation?.StandardOutputContent || 'Unknown error';
        throw new Error(`Failed to get machine ID: ${errorMsg}`);
      }

      const output = invocation.StandardOutputContent?.trim() || '';
      if (!output) {
        throw new Error('Empty response from agent');
      }

      let data;
      try {
        data = JSON.parse(output);
      } catch (parseError) {
        throw new Error(`Invalid JSON response from agent: ${output.substring(0, 200)}`);
      }

      if (!data.machineId) {
        throw new Error(`Machine ID not found in response: ${JSON.stringify(data)}`);
      }

      return data.machineId;
    } catch (error: any) {
      console.error('Failed to get machine ID:', error);
      throw error;
    }
  }

  /**
   * Set AWS credentials on agent
   */
  async setAwsConfig(instanceId: string): Promise<{ status: string; message: string; region?: string; warning?: string }> {
    const ssmStatus = await this.checkSSMAgentStatus(instanceId);
    if (!ssmStatus.isInstalled || !ssmStatus.isRunning) {
      throw new Error('SSM agent is not available on the instance.');
    }

    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings) {
      throw new Error('Server settings not found. Please configure AWS credentials in AWS Settings.');
    }

    if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
    }

    const region = serverSettings.awsRegion || 'us-east-1';

    try {
      const client = await this.getSSMClient();
      const payload = JSON.stringify({
        AWS_ACCESS_KEY_ID: serverSettings.awsAccessKeyId,
        AWS_SECRET_ACCESS_KEY: serverSettings.awsSecretAccessKey,
        AWS_REGION: region,
      });

      // Base64 encode the JSON to avoid shell escaping issues
      const base64Payload = Buffer.from(payload).toString('base64');
      const curlCommand = `echo '${base64Payload}' | base64 -d | curl -s -X PUT http://127.0.0.1:${AGENT_API_PORT}/internal/set-aws-config -H "Content-Type: application/json" -d @-`;

      const command = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Set AWS credentials on agent',
        Parameters: {
          commands: [curlCommand],
        },
        TimeoutSeconds: 30,
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM.');
      }

      // Wait for command to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const invocation = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }),
      );

      if (invocation.Status !== 'Success') {
        throw new Error(`Failed to set AWS config: ${invocation.StandardErrorContent || 'Unknown error'}`);
      }

      const output = invocation.StandardOutputContent?.trim() || '';
      if (!output) {
        throw new Error('Empty response from agent');
      }

      const data = JSON.parse(output);
      return data;
    } catch (error) {
      console.error('Failed to set AWS config:', error);
      throw error;
    }
  }

  /**
   * Validate S3 configuration on agent
   */
  async validateS3Config(instanceId: string, autoSetCredentials: boolean = true): Promise<{
    valid: boolean;
    region?: string;
    bucketExists?: boolean;
    machineId?: string;
    credentialsType?: string;
    errors?: string[];
    warnings?: string[];
  }> {
    const ssmStatus = await this.checkSSMAgentStatus(instanceId);
    if (!ssmStatus.isInstalled || !ssmStatus.isRunning) {
      return {
        valid: false,
        errors: ['SSM agent is not available on the instance.'],
      };
    }

    // Automatically set AWS credentials if we have them and autoSetCredentials is true
    if (autoSetCredentials) {
      try {
        const serverSettings = await this.serverSettingsProvider.getSettings();
        if (serverSettings?.awsAccessKeyId && serverSettings?.awsSecretAccessKey) {
          await this.setAwsConfig(instanceId);
          logger.debug({ instanceId }, 'Auto-set AWS credentials before S3 validation');
        }
      } catch (configErr: any) {
        // Log but continue - validation will show the actual error
        logger.debug({ err: configErr, instanceId }, 'Failed to auto-set AWS config (will validate anyway)');
      }
    }

    try {
      const client = await this.getSSMClient();
      
      // First check if the agent is running on port 9811
      const checkAgentCommand = `curl -s --max-time 2 http://127.0.0.1:${AGENT_API_PORT}/health || echo "AGENT_NOT_RUNNING"`;
      const checkCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Check if agent is running',
        Parameters: {
          commands: [checkAgentCommand],
        },
        TimeoutSeconds: 30,
      });

      const checkResponse = await client.send(checkCommand);
      const checkCommandId = checkResponse.Command?.CommandId;

      if (checkCommandId) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const checkInvocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: checkCommandId,
            InstanceId: instanceId,
          }),
        );

        if (checkInvocation.StandardOutputContent?.includes('AGENT_NOT_RUNNING')) {
          return {
            valid: false,
            errors: ['JetCamer agent is not running on port 9811. Please ensure the agent is installed and running.'],
          };
        }
      }

      // Now validate S3 config
      const curlCommand = `curl -s --max-time 5 http://127.0.0.1:${AGENT_API_PORT}/internal/s3-validate`;

      const command = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Validate S3 configuration on agent',
        Parameters: {
          commands: [curlCommand],
        },
        TimeoutSeconds: 30,
      });

      const response = await client.send(command);
      const commandId = response.Command?.CommandId;

      if (!commandId) {
        throw new Error('Failed to get command ID from SSM.');
      }

      // Wait for command to complete with retries
      let attempts = 0;
      let invocation;
      while (attempts < 5) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        invocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          }),
        );

        if (invocation.Status === 'Success' || invocation.Status === 'Failed' || invocation.Status === 'TimedOut') {
          break;
        }
        attempts++;
      }

      if (!invocation || invocation.Status !== 'Success') {
        const errorMsg = invocation?.StandardErrorContent || invocation?.StandardOutputContent || 'Unknown error';
        return {
          valid: false,
          errors: [`Failed to validate S3 config: ${errorMsg}`],
        };
      }

      const output = invocation.StandardOutputContent?.trim() || '';
      if (!output) {
        return {
          valid: false,
          errors: ['Empty response from agent'],
        };
      }

      let data;
      try {
        data = JSON.parse(output);
      } catch (parseError) {
        return {
          valid: false,
          errors: [`Invalid JSON response from agent: ${output.substring(0, 200)}`],
        };
      }

      // If bucket doesn't exist and we have valid credentials, create it
      if (data.valid && data.warnings?.some((w: string) => w.includes('bucket') || w.includes('Bucket'))) {
        // If valid but bucket doesn't exist, try to create it from our side
        try {
          // Import S3DataService to create bucket
          // We need to get the actual ServerSettingsProvider instance from the module
          // For now, create S3DataService with the same provider interface
          const { S3DataService } = await import('./s3-data.service.js');
          // Create a wrapper that matches ServerSettingsProvider interface
          const s3DataService = new S3DataService({
            getSettings: () => this.serverSettingsProvider.getSettings(),
          } as any);
          await s3DataService.ensureBucketExists();
          logger.info({ instanceId }, 'Created S3 bucket after validation warning');
          
          // Re-validate to get updated status
          const revalidateCommand = `curl -s --max-time 5 http://127.0.0.1:${AGENT_API_PORT}/internal/s3-validate`;
          const revalidateResponse = await client.send(
            new SendCommandCommand({
              InstanceIds: [instanceId],
              DocumentName: 'AWS-RunShellScript',
              Comment: 'Re-validate S3 configuration after bucket creation',
              Parameters: {
                commands: [revalidateCommand],
              },
              TimeoutSeconds: 30,
            }),
          );
          
          if (revalidateResponse.Command?.CommandId) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const revalidateInvocation = await client.send(
              new GetCommandInvocationCommand({
                CommandId: revalidateResponse.Command.CommandId,
                InstanceId: instanceId,
              }),
            );
            
            if (revalidateInvocation.Status === 'Success' && revalidateInvocation.StandardOutputContent) {
              const revalidateData = JSON.parse(revalidateInvocation.StandardOutputContent.trim());
              // Remove bucket warning if bucket now exists
              if (revalidateData.warnings) {
                revalidateData.warnings = revalidateData.warnings.filter((w: string) => 
                  !w.includes('bucket') && !w.includes('Bucket')
                );
              }
              return revalidateData;
            }
          }
        } catch (bucketErr: any) {
          logger.warn({ err: bucketErr, instanceId }, 'Failed to create bucket, agent will create on first upload');
          // Return original data with warning
        }
      }

      return data;
    } catch (error: any) {
      console.error('Failed to validate S3 config:', error);
      return {
        valid: false,
        errors: [error.message || 'Failed to validate S3 configuration'],
      };
    }
  }
}

