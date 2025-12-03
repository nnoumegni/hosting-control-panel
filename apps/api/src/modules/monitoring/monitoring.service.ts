import { logger } from '../../core/logger/index.js';
import type { MonitoringRepository } from './monitoring.repository.js';
import type {
  AgentConfig,
  AgentHeartbeat,
  LogEvent,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  SystemMetrics,
} from './monitoring.repository.js';
import { AgentDeploymentService } from './agent-deployment.service.js';
import { AgentPullService } from './agent-pull.service.js';
import type { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';
import { env } from '../../config/env.js';

export class MonitoringService {
  private deploymentService: AgentDeploymentService;
  private pullService: AgentPullService;

  constructor(
    private readonly repository: MonitoringRepository,
    serverSettingsProvider: ServerSettingsProvider,
  ) {
    this.deploymentService = new AgentDeploymentService(serverSettingsProvider);
    this.pullService = new AgentPullService(serverSettingsProvider);
  }

  /**
   * Pull agent status from instance via SSM (pull-based monitoring)
   */
  async pullAgentStatus(instanceId: string): Promise<AgentHeartbeat | null> {
    const status = await this.pullService.pullAgentStatus(instanceId);
    
    if (!status) {
      return null;
    }

    // Save the pulled status as a heartbeat
    return this.saveHeartbeat({
      instanceId,
      version: status.version,
      metrics: status.metrics,
      blockedIps: status.blockedIps,
    });
  }

  /**
   * Save heartbeat from agent (for push-based monitoring, if needed)
   */
  async saveHeartbeat(data: {
    instanceId: string;
    version: string;
    metrics: SystemMetrics;
    blockedIps?: string[];
  }): Promise<AgentHeartbeat> {
    const now = new Date();

    const heartbeat: Omit<AgentHeartbeat, '_id' | 'createdAt' | 'updatedAt'> = {
      instanceId: data.instanceId,
      version: data.version,
      timestamp: now,
      metrics: data.metrics,
      blockedIps: data.blockedIps || [],
      status: 'online',
      lastSeen: now,
    };

    const saved = await this.repository.saveHeartbeat(heartbeat);

    // Update or create agent config if it doesn't exist
    const config = await this.repository.getAgentConfig(data.instanceId);
    if (!config) {
      // Create default config
      const apiUrl = env.API_URL || env.API_BASE_URL || 'http://localhost:4000';
      await this.repository.saveAgentConfig({
        instanceId: data.instanceId,
        dashboardUrl: apiUrl,
      });
    }

    logger.debug({ instanceId: data.instanceId }, 'Heartbeat saved');

    return saved;
  }

  /**
   * Get latest heartbeat for an instance
   */
  async getLatestHeartbeat(instanceId: string): Promise<AgentHeartbeat | null> {
    return this.repository.getLatestHeartbeat(instanceId);
  }

  /**
   * Get heartbeats with optional filters
   */
  async getHeartbeats(
    instanceId: string,
    options?: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<AgentHeartbeat[]> {
    return this.repository.getHeartbeats(
      instanceId,
      options?.limit,
      options?.startDate,
      options?.endDate,
    );
  }

  /**
   * Get online agents
   */
  async getOnlineAgents(): Promise<string[]> {
    return this.repository.getOnlineAgents();
  }

  /**
   * Test log file access directly
   */
  async testLogFileAccess(instanceId: string, logPath: string): Promise<{ exists: boolean; readable: boolean; lines: string[] }> {
    return this.deploymentService.testLogFileAccess(instanceId, logPath);
  }

  /**
   * Pull and save log events from agent
   */
  async pullAndSaveLogEvents(instanceId: string, limit = 50, since?: Date): Promise<number> {
    const events = await this.pullService.pullLogEvents(instanceId, limit, since);
    
    logger.info({ instanceId, eventsCount: events.length }, 'Pulled log events from agent');
    
    let savedCount = 0;
    for (const event of events) {
      try {
        await this.saveLogEvent({
          instanceId,
          ip: event.ip,
          path: event.path,
          status: event.status,
          method: event.method,
          userAgent: event.userAgent,
          raw: event.raw,
          timestamp: event.timestamp,
        });
        savedCount++;
      } catch (error) {
        logger.warn({ err: error, instanceId, ip: event.ip }, 'Failed to save log event');
      }
    }
    
    logger.info({ instanceId, savedCount, total: events.length }, 'Pulled and saved log events');
    return savedCount;
  }

  /**
   * Save log event
   */
  async saveLogEvent(data: {
    instanceId: string;
    ip: string;
    path: string;
    status: number;
    method?: string;
    userAgent?: string;
    raw: string;
    timestamp?: Date | string;
  }): Promise<LogEvent> {
    const timestamp = data.timestamp 
      ? (typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp)
      : new Date();
      
    const event: Omit<LogEvent, '_id' | 'createdAt'> = {
      instanceId: data.instanceId,
      timestamp,
      ip: data.ip,
      path: data.path,
      status: data.status,
      method: data.method,
      userAgent: data.userAgent,
      raw: data.raw,
    };

    return this.repository.saveLogEvent(event);
  }

  /**
   * Get log events
   */
  async getLogEvents(
    instanceId: string,
    options?: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<LogEvent[]> {
    return this.repository.getLogEvents(
      instanceId,
      options?.limit,
      options?.startDate,
      options?.endDate,
    );
  }

  /**
   * Get log events by IP
   */
  async getLogEventsByIp(ip: string, limit?: number): Promise<LogEvent[]> {
    return this.repository.getLogEventsByIp(ip, limit);
  }

  /**
   * Create or update agent config
   */
  async saveAgentConfig(config: CreateAgentConfigInput): Promise<AgentConfig> {
    const existing = await this.repository.getAgentConfig(config.instanceId);
    
    if (existing) {
      // Update existing
      const updated = await this.repository.updateAgentConfig(config.instanceId, config);
      if (!updated) {
        throw new Error('Failed to update agent config');
      }
      return updated;
    }

    // Create new
    return this.repository.saveAgentConfig(config);
  }

  /**
   * Get agent config
   */
  async getAgentConfig(instanceId: string): Promise<AgentConfig | null> {
    return this.repository.getAgentConfig(instanceId);
  }

  /**
   * Update agent config
   */
  async updateAgentConfig(
    instanceId: string,
    updates: UpdateAgentConfigInput,
  ): Promise<AgentConfig> {
    const updated = await this.repository.updateAgentConfig(instanceId, updates);
    if (!updated) {
      throw new Error('Agent config not found');
    }
    return updated;
  }

  /**
   * Delete agent config
   */
  async deleteAgentConfig(instanceId: string): Promise<void> {
    await this.repository.deleteAgentConfig(instanceId);
  }

  /**
   * Discover all Apache/Nginx log files from web server configuration
   */
  private async discoverLogFiles(instanceId: string): Promise<string[]> {
    try {
      // Check if Apache is installed and get all log file paths using wildcard patterns
      const apacheLogDiscovery = `#!/bin/bash
# Discover ALL Apache and Nginx log files using wildcard patterns
# Use a temp file to collect results (since while loops run in subshells)
TEMP_FILE=\$(mktemp)
trap "rm -f \\$TEMP_FILE" EXIT

# Discover Apache access logs using wildcard patterns
if command -v apache2ctl &> /dev/null || command -v httpd &> /dev/null; then
  # Apache2 style: /var/log/apache2/*access*.log
  if [ -d "/var/log/apache2" ]; then
    find /var/log/apache2 -name "*access*.log" -type f 2>/dev/null >> "$TEMP_FILE"
  fi
  
        # httpd style: /var/log/httpd/*access*
        if [ -d "/var/log/httpd" ]; then
          # Exclude rotated files (those with date patterns like -20251019)
          find /var/log/httpd -name "*access*" -type f 2>/dev/null | grep -vE "-[0-9]{8}" >> "$TEMP_FILE"
        fi
  
  # Also check common default locations
  for DEFAULT_LOG in /var/log/apache2/access.log /var/log/httpd/access_log /var/log/apache2/ssl-access.log /var/log/httpd/ssl_access_log; do
    if [ -f "$DEFAULT_LOG" ]; then
      echo "$DEFAULT_LOG" >> "$TEMP_FILE"
    fi
  done
  
  # Parse Apache configs for CustomLog directives as backup
  APACHE_CONFIG_DIRS="/etc/apache2 /etc/httpd"
  for CONFIG_DIR in $APACHE_CONFIG_DIRS; do
    if [ -d "$CONFIG_DIR" ]; then
      grep -r "CustomLog" "$CONFIG_DIR" 2>/dev/null | grep -v "^#" | while IFS= read -r line; do
        # Extract quoted paths: CustomLog "/path/to/log" combined
        QUOTED=\$(echo "$line" | sed -n 's/.*CustomLog[[:space:]]*"\\([^"]*\\)".*/\\1/p')
        if [ -n "$QUOTED" ] && [ -f "$QUOTED" ]; then
          echo "$QUOTED" >> "$TEMP_FILE"
        fi
        # Extract unquoted paths: CustomLog /path/to/log combined
        UNQUOTED=\$(echo "$line" | sed -n 's/.*CustomLog[[:space:]]*\\([^[:space:]]*\\)[[:space:]].*/\\1/p' | grep "^/")
        if [ -n "$UNQUOTED" ] && [ -f "$UNQUOTED" ]; then
          echo "$UNQUOTED" >> "$TEMP_FILE"
        fi
      done
    fi
  done
fi

# Discover Nginx access logs using wildcard patterns
if command -v nginx &> /dev/null; then
  # Nginx style: /var/log/nginx/*access*.log
  if [ -d "/var/log/nginx" ]; then
    find /var/log/nginx -name "*access*.log" -type f 2>/dev/null >> "$TEMP_FILE"
  fi
  
  # Also check default locations
  for DEFAULT_LOG in /var/log/nginx/access.log /var/log/nginx/access_log; do
    if [ -f "$DEFAULT_LOG" ]; then
      echo "$DEFAULT_LOG" >> "$TEMP_FILE"
    fi
  done
  
  # Parse Nginx configs for access_log directives as backup
  NGINX_CONFIG_DIRS="/etc/nginx"
  for CONFIG_DIR in $NGINX_CONFIG_DIRS; do
    if [ -d "$CONFIG_DIR" ]; then
      grep -r "access_log" "$CONFIG_DIR" 2>/dev/null | grep -v "^#" | while IFS= read -r line; do
        # Extract log path: access_log /path/to/log combined;
        LOG_PATH=\$(echo "$line" | sed -n 's/.*access_log[[:space:]]*\\([^;[:space:]]*\\)[[:space:]].*/\\1/p' | grep "^/")
        if [ -n "$LOG_PATH" ] && [ -f "$LOG_PATH" ]; then
          echo "$LOG_PATH" >> "$TEMP_FILE"
        fi
      done
    fi
  done
fi

# Output unique log files, one per line (filter out empty lines and invalid entries)
cat "$TEMP_FILE" 2>/dev/null | grep -v "^$" | grep -v "^combined$" | grep "^/" | sort -u
`;

      const logFiles = await this.deploymentService.executeCommand(instanceId, apacheLogDiscovery);
      logger.info({ instanceId, rawOutput: logFiles.substring(0, 1000), outputLength: logFiles.length }, 'Raw log discovery output');
      
      const paths = logFiles
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => {
          const isValid = line.length > 0 && 
                         !line.includes('NOT_FOUND') && 
                         !line.includes('combined') &&
                         line.startsWith('/') &&
                         !line.match(/-[0-9]{8}/); // Exclude rotated files with date patterns
          return isValid;
        });

      // Test reading a sample log file to verify access
      if (paths.length > 0) {
        const samplePath = paths[0];
        logger.info({ instanceId, samplePath }, 'Testing access to sample log file');
        const testResult = await this.deploymentService.testLogFileAccess(instanceId, samplePath);
        logger.info({ instanceId, samplePath, testResult }, 'Log file access test result');
        
        if (!testResult.readable) {
          logger.warn({ instanceId, samplePath }, 'Sample log file is not readable, may have permission issues');
        }
      }

      if (paths.length > 0) {
        logger.info({ instanceId, logFilesCount: paths.length, sample: paths.slice(0, 5) }, 'Discovered log files from web server configuration');
        return paths;
      } else {
        logger.warn({ instanceId, rawOutput: logFiles.substring(0, 500) }, 'No log files discovered, using defaults');
        // Return default log paths as fallback
        return [
          '/var/log/httpd/access_log',
          '/var/log/apache2/access.log',
          '/var/log/nginx/access.log',
        ];
      }
    } catch (error) {
      logger.warn({ err: error, instanceId }, 'Failed to discover log files, using defaults');
      // Return default log paths as fallback
      return [
        '/var/log/httpd/access_log',
        '/var/log/apache2/access.log',
        '/var/log/nginx/access.log',
      ];
    }
  }

  /**
   * Deploy agent to instance
   */
  async deployAgent(instanceId: string, config?: Partial<CreateAgentConfigInput>): Promise<{
    commandId: string;
    config: AgentConfig;
  }> {
    // Get or create config
    let agentConfig = await this.repository.getAgentConfig(instanceId);
    
    // Always discover log files on deploy (unless explicitly provided)
    // This ensures we find all log files even if config already exists
    let logPaths: string[] = [];
    if (Array.isArray(config?.logPaths) && config.logPaths.length > 0) {
      // Use provided log paths
      logPaths = config.logPaths;
    } else {
      // Auto-discover log files from web server configuration
      logPaths = await this.discoverLogFiles(instanceId);
    }
    
    if (!agentConfig) {
      // Create default config
      // Use API_URL or API_BASE_URL, defaulting to localhost for development
      // In production, this should be set to the actual API server URL that EC2 instances can reach
      const apiUrl = config?.dashboardUrl || env.API_URL || env.API_BASE_URL || 'http://localhost:4000';
      agentConfig = await this.repository.saveAgentConfig({
        instanceId,
        dashboardUrl: apiUrl,
        logPaths: logPaths, // Always an array
        tailFormat: config?.tailFormat, // Will default to undefined, agent will auto-detect
        autoUpdate: config?.autoUpdate !== false,
        heartbeatInterval: config?.heartbeatInterval || 10,
        requestThreshold: config?.requestThreshold || 200,
        blockDurationMinutes: config?.blockDurationMinutes || 60,
      });
    } else if (config || logPaths.length > 0) {
      // Update config if provided or if we discovered new log paths
      const updates: Partial<CreateAgentConfigInput> = { ...config };
      if (logPaths.length > 0) {
        updates.logPaths = logPaths;
      }
      agentConfig = await this.updateAgentConfig(instanceId, updates);
    }

    // Deploy agent
    const { commandId } = await this.deploymentService.deployAgent(instanceId, agentConfig);

    logger.info({ instanceId, commandId }, 'Agent deployment initiated');

    return { commandId, config: agentConfig };
  }

  /**
   * Check deployment status
   */
  async checkDeploymentStatus(instanceId: string, commandId: string) {
    return this.deploymentService.checkDeploymentStatus(instanceId, commandId);
  }

  /**
   * Start monitoring agent (starts the service, installs if not installed)
   */
  async startMonitoring(instanceId: string, config?: Partial<CreateAgentConfigInput>): Promise<{
    commandId: string;
    config: AgentConfig;
  }> {
    // Check if agent config exists
    let agentConfig = await this.repository.getAgentConfig(instanceId);
    
    if (!agentConfig) {
      // Not installed - deploy it (which installs and starts)
      return this.deployAgent(instanceId, config);
    }
    
    // Already installed - try to start the service
    // If start fails (agent crashes), automatically redeploy with latest code
    try {
      const { commandId } = await this.deploymentService.startAgent(instanceId);
      
      // Poll for command completion to see if it succeeded
      let attempts = 0;
      const maxAttempts = 15; // 30 seconds total
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const startStatus = await this.deploymentService.checkDeploymentStatus(instanceId, commandId);
        
        if (startStatus.status === 'installed') {
          // Start succeeded
          logger.info({ instanceId }, 'Agent started successfully');
          return { commandId, config: agentConfig };
        } else if (startStatus.status === 'failed') {
          // Start failed - agent is crashing, redeploy with latest code
          logger.warn({ instanceId, reason: startStatus.message }, 'Agent start failed, redeploying with latest code');
          // Redeploy to get the latest agent code
          return this.deployAgent(instanceId, config || {});
        } else if (startStatus.status === 'installing') {
          // Still in progress, keep polling
          attempts++;
          continue;
        } else {
          // Unknown status (not_installed) - assume failure and redeploy
          logger.warn({ instanceId, status: startStatus.status }, 'Unknown start status, redeploying');
          return this.deployAgent(instanceId, config || {});
        }
      }
      
      // Timeout - check if agent is actually running via heartbeat
      try {
        const heartbeat = await this.pullService.pullAgentStatus(instanceId);
        if (heartbeat?.status === 'online') {
          // Agent is actually online despite timeout
          logger.info({ instanceId }, 'Agent is online despite timeout');
          return { commandId, config: agentConfig };
        }
      } catch (hbError) {
        // Ignore heartbeat check errors
      }
      
      // Timeout and agent not responding - redeploy
      logger.warn({ instanceId }, 'Start command timed out, redeploying');
      return this.deployAgent(instanceId, config || {});
    } catch (error: any) {
      // If start command itself fails, redeploy
      logger.warn({ instanceId, err: error }, 'Start agent command failed, redeploying');
      return this.deployAgent(instanceId, config || {});
    }
  }

  /**
   * Stop monitoring agent (only stops the service, doesn't uninstall)
   */
  async stopMonitoring(instanceId: string): Promise<{ commandId: string }> {
    const { commandId } = await this.deploymentService.stopAgent(instanceId);
    return { commandId };
  }

  /**
   * Uninstall agent
   */
  async uninstallAgent(instanceId: string): Promise<{ commandId: string }> {
    const { commandId } = await this.deploymentService.uninstallAgent(instanceId);
    // Delete config after uninstalling
    await this.deleteAgentConfig(instanceId);
    return { commandId };
  }

  /**
   * Get metrics summary
   */
  async getMetricsSummary(
    instanceId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return this.repository.getMetricsSummary(instanceId, startDate, endDate);
  }
}

