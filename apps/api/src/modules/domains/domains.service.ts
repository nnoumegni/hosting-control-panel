import {
  SendCommandCommand,
  SSMClient,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';
import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import { logger } from '../../core/logger/index.js';
import { BadRequestError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { getEc2InstanceId } from '../../shared/aws/ec2-instance-detection.js';
import type { Domain } from './domain.repository.js';
import type { DnsService } from './dns.service.js';

export interface WebServerInfo {
  type: 'nginx' | 'apache' | 'none';
  version?: string;
  isRunning: boolean;
}

export interface HostedDomain {
  domain: string;
  serverBlock: string; // nginx server_name or apache ServerName
  documentRoot?: string;
  sslEnabled: boolean;
  sslCertificate?: string;
  configPath: string;
}

export interface DomainQuota {
  domain: string;
  used: number; // bytes
  limit?: number; // bytes
  percentage?: number;
}

export interface ServerInfo {
  instanceId: string;
  webServer: WebServerInfo;
  domains: HostedDomain[];
  publicIp?: string;
}

export class DomainsService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
    private readonly dnsService?: DnsService,
  ) {}

  /**
   * Public method to get instance public IP (for use in placeholder responses)
   */
  async getInstancePublicIpForPlaceholder(instanceId: string): Promise<string | null> {
    try {
      return await this.getInstancePublicIp(instanceId);
    } catch {
      return null;
    }
  }

  private async buildSSMClient(): Promise<SSMClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';

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

    throw new BadRequestError(
        'EC2 instance ID not found. Please provide an instance ID as a query parameter, ' +
        'or ensure this service is running on an EC2 instance with instance metadata available.',
      );
    }

  /**
   * Build EC2 client
   */
  private async buildEC2Client(): Promise<EC2Client> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';

    return new EC2Client({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Get EC2 instance public IP using EC2 API
   */
  private async getInstancePublicIp(instanceId: string): Promise<string | null> {
    try {
      const client = await this.buildEC2Client();
      const response = await client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      );

      const instance = response.Reservations?.[0]?.Instances?.[0];
      if (!instance) {
        logger.warn({ instanceId }, 'Instance not found in EC2');
        return null;
      }

      // Try public IP first, then public DNS (which resolves to public IP)
      const publicIp = instance.PublicIpAddress || 
                       (instance.PublicDnsName ? await this.resolvePublicIpFromDns(instance.PublicDnsName) : null);

      if (publicIp) {
        logger.debug({ instanceId, publicIp }, 'Retrieved public IP from EC2 API');
        return publicIp;
      }

      // If no public IP, check if it has an Elastic IP association
      if (instance.NetworkInterfaces?.[0]?.Association?.PublicIp) {
        const elasticIp = instance.NetworkInterfaces[0].Association.PublicIp;
        logger.debug({ instanceId, elasticIp }, 'Retrieved public IP from Elastic IP association');
        return elasticIp;
      }

      logger.warn({ instanceId }, 'No public IP found for instance');
      return null;
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to get public IP from EC2 API');
      throw error;
    }
  }

  /**
   * Fallback: Try to resolve public IP from public DNS name
   */
  private async resolvePublicIpFromDns(publicDnsName: string): Promise<string | null> {
    try {
      // This is a fallback - in most cases EC2 API should have PublicIpAddress
      // For now, we'll return null and let the caller handle it
      logger.debug({ publicDnsName }, 'Public DNS found but no direct IP resolution available');
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Uninstall web server using agent HTTP API
   * Requires agent HTTP API - no SSM fallback
   */
  async uninstallWebServer(
    type: 'nginx' | 'apache',
    instanceId?: string,
    agentHttpService?: { uninstallWebServer(instanceId: string, type: 'nginx' | 'apache', removeConfig?: boolean): Promise<{ commandId: string; status: string }> },
  ): Promise<{ commandId: string; status: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);

    // Require agent HTTP API - no SSM fallback
    if (!agentHttpService) {
      throw new Error('Agent HTTP service not available. Web server uninstallation requires agent HTTP API.');
    }

    try {
      logger.info({ instanceId: targetInstanceId, type }, 'Sending web server uninstallation via agent HTTP API');
      const result = await agentHttpService.uninstallWebServer(targetInstanceId, type, false);
      logger.info({ instanceId: targetInstanceId, commandId: result.commandId, type }, 'Web server uninstallation command sent successfully');
      return result;
    } catch (error: any) {
      logger.error({ err: error, instanceId: targetInstanceId, type }, 'Failed to uninstall web server via agent HTTP API');
      if (error.message?.includes('404') || error.message?.includes('connect')) {
        throw new Error('Agent HTTP API endpoint /domains/web-server/uninstall is not available. Please ensure the agent is running and supports this endpoint.');
      }
      throw error;
    }
  }

  /**
   * Install web server using agent HTTP API
   * Requires agent HTTP API - no SSM fallback
   */
  async installWebServer(
    config: {
      type: 'nginx' | 'apache';
      httpPort: number;
      httpsPort: number;
      phpVersion?: string;
      extras?: string;
      configureFirewall: boolean;
    },
    instanceId?: string,
    agentHttpService?: { installWebServer(instanceId: string, config: any): Promise<{ commandId: string; status: string }> },
  ): Promise<{ commandId: string; status: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);

    // Require agent HTTP API - no SSM fallback
    if (!agentHttpService) {
      throw new Error('Agent HTTP service not available. Web server installation requires agent HTTP API.');
    }

    try {
      logger.info({ instanceId: targetInstanceId, type: config.type }, 'Sending web server installation via agent HTTP API');
      const result = await agentHttpService.installWebServer(targetInstanceId, config);
      logger.info({ instanceId: targetInstanceId, commandId: result.commandId, type: config.type }, 'Web server installation command sent successfully');
      return result;
    } catch (error: any) {
      logger.error({ err: error, instanceId: targetInstanceId, type: config.type }, 'Failed to install web server via agent HTTP API');
      if (error.message?.includes('404') || error.message?.includes('connect')) {
        throw new Error('Agent HTTP API endpoint /domains/web-server/install is not available. Please ensure the agent is running and supports this endpoint.');
      }
      throw error;
    }
  }

  /**
   * Execute a command on the EC2 instance using SSM
   */
  private async executeCommand(command: string, instanceId?: string): Promise<string> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);

    const client = await this.buildSSMClient();

    try {
      const sendCommandResponse = await client.send(
        new SendCommandCommand({
          InstanceIds: [targetInstanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: [command],
          },
        }),
      );

      const commandId = sendCommandResponse.Command?.CommandId;
      if (!commandId) {
        throw new Error('Failed to get command ID from SSM');
      }

      // Wait for command to complete (polling)
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const invocationResponse = await client.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: targetInstanceId,
          }),
        );

        const status = invocationResponse.Status;
        if (status === 'Success') {
          const output = invocationResponse.StandardOutputContent ?? '';
          // SSM sometimes includes command echo, try to clean it up
          return output.trim();
        }
        if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
          const errorMsg = invocationResponse.StandardErrorContent ?? 'Unknown error';
          logger.error({ commandId, instanceId: targetInstanceId, errorMsg }, 'SSM command failed');
          throw new Error(`Command failed: ${errorMsg}`);
        }
        // Status is InProgress or Pending, continue polling
        attempts++;
      }

      throw new Error('Command execution timed out after 30 seconds');
    } catch (error) {
      logger.error({ err: error, command, instanceId: targetInstanceId }, 'Failed to execute SSM command');
      throw error;
    }
  }

  /**
   * Detect which web server is installed and running
   * Note: This requires SSM agent to be installed and running to execute commands.
   */
  async detectWebServer(instanceId?: string): Promise<WebServerInfo> {
    try {
      // Check for Nginx
      const nginxCheck = await this.executeCommand(
        'which nginx && nginx -v 2>&1 || echo "NOT_FOUND"',
        instanceId,
      );
      if (!nginxCheck.includes('NOT_FOUND')) {
        const versionMatch = nginxCheck.match(/nginx version (.+)/);
        const isRunning = await this.executeCommand(
          'systemctl is-active --quiet nginx && echo "running" || echo "stopped"',
          instanceId,
        ).then((output) => output.trim() === 'running');

        return {
          type: 'nginx',
          version: versionMatch?.[1],
          isRunning,
        };
      }

      // Check for Apache
      const apacheCheck = await this.executeCommand(
        'which apache2 && apache2 -v 2>&1 | head -1 || which httpd && httpd -v 2>&1 | head -1 || echo "NOT_FOUND"',
        instanceId,
      );
      if (!apacheCheck.includes('NOT_FOUND')) {
        const versionMatch = apacheCheck.match(/(?:Apache|Server version):\s*(.+)/i);
        const isRunning = await this.executeCommand(
          '(systemctl is-active --quiet apache2 || systemctl is-active --quiet httpd) && echo "running" || echo "stopped"',
          instanceId,
        ).then((output) => output.trim() === 'running');

        return {
          type: 'apache',
          version: versionMatch?.[1],
          isRunning,
        };
      }

      return {
        type: 'none',
        isRunning: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, 'Failed to detect web server');
      
      // If error is about SSM/instance ID, return a helpful message
      if (errorMessage.includes('instance ID') || errorMessage.includes('SSM')) {
        logger.warn('Cannot detect web server: SSM agent may not be available');
      }
      
      return {
        type: 'none',
        isRunning: false,
      };
    }
  }

  /**
   * Get server information including web server type and hosted domains
   * Returns placeholder if agent HTTP API endpoint is not available
   */
  async getServerInfo(instanceId?: string, agentHttpService?: { getServerInfo(instanceId?: string): Promise<any> }, getInstancePublicIp?: (instanceId: string) => Promise<string | null>): Promise<ServerInfo> {
    let targetInstanceId = instanceId;
    
    // Try to get instance ID if not provided
    if (!targetInstanceId) {
      try {
        const detectedId = await Promise.race([
          getEc2InstanceId(),
          new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        targetInstanceId = detectedId ?? undefined;
      } catch (error) {
        logger.debug({ err: error }, 'Failed to auto-detect EC2 instance ID');
      }
    }

    if (!targetInstanceId) {
      throw new Error(
        'EC2 instance ID not found. Please provide an instance ID as a query parameter, ' +
        'or ensure this service is running on an EC2 instance with instance metadata available.',
      );
    }

    // Try agent HTTP API first
    if (agentHttpService) {
      try {
        const agentInfo = await agentHttpService.getServerInfo(targetInstanceId);
        if (agentInfo) {
          logger.debug({ instanceId: targetInstanceId }, 'Got server info from agent HTTP API');
          return agentInfo;
        }
      } catch (error: any) {
        // If endpoint doesn't exist, return placeholder instead of throwing
        // Check for specific error conditions: 404, connection refused, or explicit "not available" message
        const errorMsg = error.message?.toLowerCase() || '';
        const isConnectionError = errorMsg.includes('could not connect') || 
                                  errorMsg.includes('econnrefused') || 
                                  errorMsg.includes('failed to fetch') ||
                                  errorMsg.includes('timeout');
        const isNotFound = errorMsg.includes('404') || errorMsg.includes('not found');
        const isNotAvailable = errorMsg.includes('not available');
        
        if (isNotFound || isConnectionError || isNotAvailable) {
          logger.debug({ err: error, instanceId: targetInstanceId, errorMsg }, 'Agent HTTP API endpoint not available, returning placeholder');
          
          // Get public IP if available
          let publicIp: string | undefined;
          if (getInstancePublicIp) {
            try {
              publicIp = (await getInstancePublicIp(targetInstanceId)) || undefined;
            } catch {
              // Ignore IP fetch errors
            }
          }
          
          // Return placeholder response
          return {
            instanceId: targetInstanceId,
            webServer: {
              type: 'none',
              isRunning: false,
            },
            domains: [],
            publicIp,
          };
        }
        // For other errors, re-throw
        throw error;
      }
    }

    // If no agent service, return placeholder
    logger.debug({ instanceId: targetInstanceId }, 'Agent HTTP service not available, returning placeholder');
    
    // Get public IP if available
    let publicIp: string | undefined;
    if (getInstancePublicIp) {
      try {
        publicIp = (await getInstancePublicIp(targetInstanceId)) || undefined;
      } catch {
        // Ignore IP fetch errors
      }
    }
    
    return {
      instanceId: targetInstanceId,
      webServer: {
        type: 'none',
        isRunning: false,
      },
      domains: [],
      publicIp,
    };
  }

  /**
   * Get quota/disk usage for a domain
   * Requires agent HTTP API - no SSM fallback
   */
  async getDomainQuota(domain: string, documentRoot?: string, instanceId?: string, agentHttpService?: { getDomainQuota(instanceId: string, domain: string, documentRoot?: string): Promise<any> }): Promise<DomainQuota> {
    let targetInstanceId = instanceId;
    
    // Try to get instance ID if not provided
    if (!targetInstanceId) {
      try {
        const detectedId = await Promise.race([
          getEc2InstanceId(),
          new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        targetInstanceId = detectedId ?? undefined;
      } catch (error) {
        logger.debug({ err: error }, 'Failed to auto-detect EC2 instance ID');
      }
    }

    if (!targetInstanceId) {
      throw new Error(
        'EC2 instance ID not found. Please provide an instance ID as a query parameter, ' +
        'or ensure this service is running on an EC2 instance with instance metadata available.',
      );
    }

    // Require agent HTTP API - no SSM fallback
    if (!agentHttpService) {
      throw new Error('Agent HTTP service not available. Domain quota requires agent HTTP API.');
    }

    try {
      const agentQuota = await agentHttpService.getDomainQuota(targetInstanceId, domain, documentRoot);
      if (agentQuota) {
        logger.debug({ instanceId: targetInstanceId, domain }, 'Got domain quota from agent HTTP API');
        return agentQuota;
      }
      throw new Error('Agent HTTP API returned null for domain quota');
    } catch (error: any) {
      logger.error({ err: error, instanceId: targetInstanceId, domain }, 'Failed to get domain quota from agent HTTP API');
      if (error.message?.includes('404') || error.message?.includes('connect')) {
        throw new Error('Agent HTTP API endpoint /domains/quota is not available. Please ensure the agent is running and supports this endpoint.');
      }
      throw error;
    }
  }

  /**
   * Generate nginx server block configuration
   */
  private generateNginxConfig(domain: string, documentRoot: string, _publicIp: string, sslEnabled: boolean): string {
    const serverName = domain;
    const rootPath = documentRoot;
    
    let config = `server {
    listen 80;
    listen [::]:80;
    server_name ${serverName} www.${serverName};
    root ${rootPath};
    index index.html index.htm index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\\.ht {
        deny all;
    }
}`;

    if (sslEnabled) {
      config += `

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${serverName} www.${serverName};
    root ${rootPath};
    index index.html index.htm index.php;

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\\.ht {
        deny all;
    }
}`;
    }

    return config;
  }

  /**
   * Generate Apache virtual host configuration
   */
  private generateApacheConfig(domain: string, documentRoot: string, _publicIp: string, sslEnabled: boolean): string {
    const serverName = domain;
    const rootPath = documentRoot;
    
    let config = `<VirtualHost *:80>
    ServerName ${serverName}
    ServerAlias www.${serverName}
    DocumentRoot ${rootPath}
    
    <Directory ${rootPath}>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog /var/log/apache2/error.log
    CustomLog /var/log/apache2/access.log combined
</VirtualHost>`;

    if (sslEnabled) {
      config += `

<VirtualHost *:443>
    ServerName ${serverName}
    ServerAlias www.${serverName}
    DocumentRoot ${rootPath}
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/${domain}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${domain}/privkey.pem
    SSLCertificateChainFile /etc/letsencrypt/live/${domain}/chain.pem
    
    <Directory ${rootPath}>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog /var/log/apache2/ssl-error.log
    CustomLog /var/log/apache2/ssl-access.log combined
</VirtualHost>`;
    }

    return config;
  }

  /**
   * Create web server configuration for a domain
   */
  private async createWebServerConfig(
    domain: string,
    documentRoot: string,
    publicIp: string,
    webServerType: 'nginx' | 'apache',
    sslEnabled: boolean,
    instanceId: string,
  ): Promise<{ configPath: string; commandId: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    const client = await this.buildSSMClient();

    // Generate configuration based on web server type
    const configContent =
      webServerType === 'nginx'
        ? this.generateNginxConfig(domain, documentRoot, publicIp, sslEnabled)
        : this.generateApacheConfig(domain, documentRoot, publicIp, sslEnabled);

    const configFileName =
      webServerType === 'nginx' ? `/etc/nginx/sites-available/${domain}` : `/etc/apache2/sites-available/${domain}.conf`;

    const commands = [
      `echo "Creating web server configuration for ${domain}..."`,
      // Create document root directory
      `mkdir -p ${documentRoot}`,
      `chown -R www-data:www-data ${documentRoot} || chown -R apache:apache ${documentRoot} || true`,
      `chmod -R 755 ${documentRoot}`,
      // Create default index.html if doesn't exist
      `if [ ! -f ${documentRoot}/index.html ]; then echo '<!DOCTYPE html><html><head><title>Welcome to ${domain}</title></head><body><h1>Welcome to ${domain}</h1><p>Your domain is now configured and ready to use!</p></body></html>' > ${documentRoot}/index.html; fi`,
    ];

    // Write configuration file
    commands.push(`cat > ${configFileName} << 'EOF'
${configContent}
EOF`);

    // Enable site (nginx: symlink, apache: a2ensite)
    if (webServerType === 'nginx') {
      commands.push(`ln -sf ${configFileName} /etc/nginx/sites-enabled/${domain}`);
      commands.push('nginx -t && systemctl reload nginx || true');
    } else {
      commands.push(`a2ensite ${domain}.conf 2>/dev/null || true`);
      commands.push('apache2ctl configtest && systemctl reload apache2 || httpd -t && systemctl reload httpd || true');
    }

    logger.info({ instanceId: targetInstanceId, domain, webServerType, configPath: configFileName }, 'Sending web server config creation command');

    const command = new SendCommandCommand({
      InstanceIds: [targetInstanceId],
      DocumentName: 'AWS-RunShellScript',
      Comment: `Create web server config for ${domain}`,
      Parameters: {
        commands,
      },
      TimeoutSeconds: 120,
    });

    const response = await client.send(command);
    const commandId = response.Command?.CommandId;

    if (!commandId) {
      throw new Error('Failed to get command ID from SSM');
    }

    return { configPath: configFileName, commandId };
  }

  /**
   * Delete web server configuration for a domain
   */
  private async deleteWebServerConfig(
    domain: string,
    configPath: string,
    webServerType: 'nginx' | 'apache',
    instanceId: string,
  ): Promise<{ commandId: string }> {
    const targetInstanceId = await this.resolveInstanceId(instanceId);
    const client = await this.buildSSMClient();

    const commands = [`echo "Deleting web server configuration for ${domain}..."`];

    // Disable site
    if (webServerType === 'nginx') {
      commands.push(`rm -f /etc/nginx/sites-enabled/${domain}`);
    } else {
      commands.push(`a2dissite ${domain}.conf 2>/dev/null || true`);
    }

    // Remove configuration file
    commands.push(`rm -f ${configPath}`);

    // Reload web server
    if (webServerType === 'nginx') {
      commands.push('nginx -t && systemctl reload nginx || true');
    } else {
      commands.push('apache2ctl configtest && systemctl reload apache2 || httpd -t && systemctl reload httpd || true');
    }

    logger.info({ instanceId: targetInstanceId, domain, webServerType, configPath }, 'Sending web server config deletion command');

    const command = new SendCommandCommand({
      InstanceIds: [targetInstanceId],
      DocumentName: 'AWS-RunShellScript',
      Comment: `Delete web server config for ${domain}`,
      Parameters: {
        commands,
      },
      TimeoutSeconds: 120,
    });

    const response = await client.send(command);
    const commandId = response.Command?.CommandId;

    if (!commandId) {
      throw new Error('Failed to get command ID from SSM');
    }

    return { commandId };
  }

  /**
   * Create a new domain
   * Creates Route53 hosted zone and web server config (no MongoDB)
   */
  async createDomain(input: {
    domain: string;
    instanceId?: string;
    documentRoot?: string;
    sslEnabled?: boolean;
  }): Promise<{ domain: Domain; commandId: string }> {
    if (!this.dnsService) {
      throw new BadRequestError('DNS service not configured');
    }

    const targetInstanceId = await this.resolveInstanceId(input.instanceId);

    // Check if domain already exists in Route53
    const zones = await this.dnsService.listHostedZones();
    const domainLower = input.domain.toLowerCase().replace(/\.$/, '');
    const existing = zones.find(z => {
      const zoneName = z.name.toLowerCase().replace(/\.$/, '');
      return zoneName === domainLower || domainLower.endsWith(`.${zoneName}`);
    });
    if (existing) {
      throw new BadRequestError(`Domain ${input.domain} already exists in Route53`);
    }

    // Check web server is installed
    const webServer = await this.detectWebServer(targetInstanceId);
    if (webServer.type === 'none') {
      throw new BadRequestError('No web server installed. Please install Nginx or Apache first.');
    }

    // Get public IP using EC2 API (more reliable than querying via SSM)
    let publicIp: string | null;
    try {
      publicIp = await this.getInstancePublicIp(targetInstanceId);
      if (!publicIp) {
        // Fallback: Try to get it via SSM command as last resort
        logger.warn({ instanceId: targetInstanceId }, 'No public IP from EC2 API, trying SSM fallback');
        try {
          const ipOutput = await this.executeCommand(
            'curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo ""',
            targetInstanceId,
          );
          publicIp = ipOutput.trim() || null;
        } catch (ssmError) {
          logger.warn({ err: ssmError, instanceId: targetInstanceId }, 'SSM fallback also failed');
        }
      }

      if (!publicIp) {
        throw new BadRequestError(
          'EC2 instance does not have a public IP address. ' +
          'Please ensure the instance has a public IP or Elastic IP assigned. ' +
          'If using a NAT gateway, you may need to use the Elastic IP instead.',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      logger.error({ err: error, instanceId: targetInstanceId }, 'Failed to get public IP');
      throw new BadRequestError(
        `Failed to get EC2 instance public IP: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Create Route53 hosted zone
    const { zoneId, nameServers } = await this.dnsService.createHostedZone(input.domain);
    logger.info({ domain: input.domain, zoneId, nameServers }, 'Route53 hosted zone created');

    // Create A record pointing to EC2 instance
    await this.dnsService.upsertRecord(zoneId, {
      name: input.domain,
      type: 'A',
      ttl: 300,
      values: [publicIp],
    });

    // Create www A record
    await this.dnsService.upsertRecord(zoneId, {
      name: `www.${input.domain}`,
      type: 'A',
      ttl: 300,
      values: [publicIp],
    });

    logger.info({ domain: input.domain, zoneId, publicIp }, 'DNS A records created');

    // Create web server configuration
    const documentRoot = input.documentRoot || `/var/www/${input.domain}`;
    const { configPath, commandId } = await this.createWebServerConfig(
      input.domain,
      documentRoot,
      publicIp,
      webServer.type,
      input.sslEnabled ?? false,
      targetInstanceId,
    );

    // Create domain object (not saved to MongoDB - comes from Route53)
    const domain: Domain = {
      _id: zoneId,
      domain: input.domain,
      instanceId: targetInstanceId,
      hostedZoneId: zoneId,
      publicIp,
      documentRoot,
      webServerType: webServer.type,
      configPath,
      sslEnabled: input.sslEnabled ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    logger.info({ domain: input.domain, zoneId, configPath }, 'Domain created successfully');

    return { domain, commandId };
  }

  /**
   * List all domains from instance (agent endpoint)
   * Domains come from the agent endpoint only, not Route53
   */
  async listDomains(instanceId?: string, agentHttpService?: { getServerInfo(instanceId?: string): Promise<any> }): Promise<Domain[]> {
    if (!agentHttpService) {
      throw new BadRequestError('Agent HTTP service not available. Domain listing requires agent HTTP API.');
    }

    try {
      const targetInstanceId = instanceId ? await this.resolveInstanceId(instanceId) : undefined;
      
      if (!targetInstanceId) {
        throw new BadRequestError('Instance ID is required to list domains');
      }

      // Get server info from agent endpoint
      const serverInfo = await agentHttpService.getServerInfo(targetInstanceId);
      
      if (!serverInfo || !serverInfo.domains) {
        return [];
      }

      // Get instance public IP for domain objects
      let instancePublicIp: string | undefined;
      try {
        instancePublicIp = serverInfo.publicIp || (await this.getInstancePublicIp(targetInstanceId)) || undefined;
      } catch (error) {
        logger.debug({ err: error, instanceId: targetInstanceId }, 'Failed to get instance public IP');
      }

      // Convert server domains to Domain objects
      // webServerType must be 'nginx' or 'apache' (not 'none')
      const webServerType: 'nginx' | 'apache' = serverInfo.webServer?.type === 'nginx' ? 'nginx' : 
                                                  serverInfo.webServer?.type === 'apache' ? 'apache' : 'nginx'; // Default to nginx if none

      const domains: Domain[] = serverInfo.domains.map((serverDomain: any) => {
        // Try to find hosted zone ID from Route53 if DNS service is available
        let hostedZoneId = '';
        if (this.dnsService) {
          // This is async but we'll do it synchronously for now
          // In a real implementation, you might want to batch these lookups
          // For now, we'll leave it empty and it can be populated later if needed
        }

        return {
          _id: serverDomain.domain, // Use domain name as ID if no hosted zone
          domain: serverDomain.domain,
          instanceId: targetInstanceId,
          hostedZoneId: hostedZoneId,
          publicIp: instancePublicIp || serverInfo.publicIp || '',
          documentRoot: serverDomain.documentRoot || `/var/www/${serverDomain.domain}`,
          webServerType: webServerType,
          configPath: serverDomain.configPath || '',
          sslEnabled: serverDomain.sslEnabled ?? false,
          sslCertificatePath: serverDomain.sslCertificate,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      // Sort by domain name
      return domains.sort((a, b) => a.domain.localeCompare(b.domain));
    } catch (error: any) {
      logger.error({ err: error, instanceId }, 'Failed to list domains from agent endpoint');
      if (error.message?.includes('404') || error.message?.includes('connect') || error.message?.includes('not available')) {
        // Return empty array if agent endpoint doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a domain by ID (hosted zone ID) or domain name from Route53
   */
  async getDomain(idOrDomain: string): Promise<Domain | null> {
    if (!this.dnsService) {
      throw new BadRequestError('DNS service not configured');
    }

    try {
      // Get all hosted zones
      const zones = await this.dnsService.listHostedZones();
      
      // Try to find by hosted zone ID first
      let matchedZone = zones.find(z => z.id === idOrDomain || z.id.replace('/hostedzone/', '') === idOrDomain);
      
      // If not found by ID, try by domain name
      if (!matchedZone) {
        const domainLower = idOrDomain.toLowerCase().replace(/\.$/, '');
        matchedZone = zones.find(z => {
          const zoneName = z.name.toLowerCase().replace(/\.$/, '');
          return zoneName === domainLower || domainLower.endsWith(`.${zoneName}`);
        });
      }

      if (!matchedZone) {
        return null;
      }

      // Get DNS records for this zone
      const records = await this.dnsService.getDomainRecords(matchedZone.name);
      const aRecord = records?.records.find(r => r.type === 'A' && (r.name === matchedZone.name || r.name === `www.${matchedZone.name}`));
      const documentRoot = aRecord ? `/var/www/${matchedZone.name}` : undefined;

        return {
          _id: matchedZone.id,
          domain: matchedZone.name,
          instanceId: '', // Will be determined from A record if needed
          hostedZoneId: matchedZone.id,
          publicIp: aRecord?.values[0] || '',
          documentRoot: documentRoot || `/var/www/${matchedZone.name}`,
          webServerType: 'nginx' as const, // Default to nginx, will be determined from server-info endpoint
          configPath: '',
          sslEnabled: false, // Will be determined from server-info endpoint
          createdAt: new Date(),
          updatedAt: new Date(),
        };
    } catch (error) {
      logger.error({ err: error, idOrDomain }, 'Failed to get domain from Route53');
      return null;
    }
  }

  /**
   * Update a domain
   * Updates web server config via agent (no MongoDB)
   */
  async updateDomain(
    idOrDomain: string,
    updates: {
      documentRoot?: string;
      sslEnabled?: boolean;
      sslCertificatePath?: string;
    },
    instanceId?: string,
  ): Promise<Domain | null> {
    const domain = await this.getDomain(idOrDomain);
    if (!domain) {
      throw new BadRequestError(`Domain not found: ${idOrDomain}`);
    }

    // Get instance ID if not provided
    const targetInstanceId = instanceId || domain.instanceId;
    if (!targetInstanceId) {
      throw new BadRequestError('Instance ID is required to update domain');
    }

    // If document root or SSL status changed, update web server config via agent
    if (updates.documentRoot !== undefined || updates.sslEnabled !== undefined) {
      const { commandId } = await this.createWebServerConfig(
        domain.domain,
        updates.documentRoot || domain.documentRoot,
        domain.publicIp,
        domain.webServerType,
        updates.sslEnabled ?? domain.sslEnabled,
        targetInstanceId,
      );
      logger.info({ domain: domain.domain, commandId }, 'Web server config updated');
    }

    // Return updated domain (metadata comes from Route53 and agent endpoint)
    return {
      ...domain,
      documentRoot: updates.documentRoot ?? domain.documentRoot,
      sslEnabled: updates.sslEnabled ?? domain.sslEnabled,
      sslCertificatePath: updates.sslCertificatePath ?? domain.sslCertificatePath,
      updatedAt: new Date(),
    };
  }

  /**
   * Delete a domain
   * Deletes from Route53 and web server config (no MongoDB)
   */
  async deleteDomain(idOrDomain: string): Promise<{ commandId: string }> {
    if (!this.dnsService) {
      throw new BadRequestError('DNS service not configured');
    }

    const domain = await this.getDomain(idOrDomain);
    if (!domain) {
      throw new BadRequestError(`Domain not found: ${idOrDomain}`);
    }

    // Delete web server configuration
    const { commandId } = await this.deleteWebServerConfig(
      domain.domain,
      domain.configPath,
      domain.webServerType,
      domain.instanceId,
    );

    // Delete DNS records
    try {
      await this.dnsService.deleteRecord(domain.hostedZoneId, domain.domain, 'A');
      await this.dnsService.deleteRecord(domain.hostedZoneId, `www.${domain.domain}`, 'A');
    } catch (error) {
      logger.warn({ err: error, domain: domain.domain }, 'Failed to delete DNS records, continuing...');
    }

    // Delete hosted zone
    try {
      await this.dnsService.deleteHostedZone(domain.hostedZoneId);
      logger.info({ domain: domain.domain, zoneId: domain.hostedZoneId }, 'Route53 hosted zone deleted');
    } catch (error) {
      logger.warn({ err: error, domain: domain.domain, zoneId: domain.hostedZoneId }, 'Failed to delete hosted zone, continuing...');
    }

    // No MongoDB deletion - domain is removed from Route53
    logger.info({ domain: domain.domain }, 'Domain deleted successfully');

    return { commandId };
  }
}

