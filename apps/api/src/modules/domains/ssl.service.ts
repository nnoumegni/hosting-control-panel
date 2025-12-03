import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import { getEc2InstanceId } from '../../shared/aws/ec2-instance-detection.js';
import {
  SendCommandCommand,
  SSMClient,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';

export interface SSLCertificate {
  domain: string;
  certificatePath: string;
  keyPath: string;
  chainPath?: string;
  expiryDate?: string;
  daysUntilExpiry?: number;
  issuer?: string;
  isWildcard: boolean;
}

export class SSLService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

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
   * Execute a command on the EC2 instance using SSM
   */
  private async executeCommand(command: string, instanceId?: string): Promise<string> {
    let targetInstanceId = instanceId;
    
    // Try to get instance ID if not provided
    if (!targetInstanceId) {
      try {
        // Use Promise.race to add an additional timeout safety net
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
      const maxAttempts = 60; // SSL operations can take longer
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Check every 2 seconds

        const invocationResponse = await client.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: targetInstanceId,
          }),
        );

        const status = invocationResponse.Status;
        if (status === 'Success') {
          return (invocationResponse.StandardOutputContent ?? '').trim();
        }
        if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
          const errorMsg = invocationResponse.StandardErrorContent ?? 'Unknown error';
          logger.error({ commandId, instanceId: targetInstanceId, errorMsg }, 'SSM command failed');
          throw new Error(`Command failed: ${errorMsg}`);
        }
        attempts++;
      }

      throw new Error('Command execution timed out');
    } catch (error) {
      logger.error({ err: error, command, instanceId: targetInstanceId }, 'Failed to execute SSM command');
      throw error;
    }
  }

  /**
   * List all SSL certificates managed by certbot
   */
  async listCertificates(instanceId?: string): Promise<SSLCertificate[]> {
    try {
      // Run certbot certificates command
      const output = await this.executeCommand(
        'certbot certificates 2>&1 || echo "CERTBOT_NOT_FOUND"',
        instanceId,
      );

      if (output.includes('CERTBOT_NOT_FOUND')) {
        logger.warn('Certbot is not installed on the server');
        return [];
      }

      const certificates: SSLCertificate[] = [];
      const lines = output.split('\n');

      let currentCert: Partial<SSLCertificate> | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Certificate name line (e.g., "Certificate Name: example.com")
        if (line.startsWith('Certificate Name:')) {
          if (currentCert && currentCert.domain) {
            certificates.push(currentCert as SSLCertificate);
          }
          const domain = line.replace('Certificate Name:', '').trim();
          currentCert = {
            domain,
            certificatePath: '',
            keyPath: '',
            isWildcard: domain.startsWith('*.'),
          };
        }

        // Certificate path
        if (line.startsWith('Certificate Path:') && currentCert) {
          currentCert.certificatePath = line.replace('Certificate Path:', '').trim();
        }

        // Private Key path
        if (line.startsWith('Private Key Path:') && currentCert) {
          currentCert.keyPath = line.replace('Private Key Path:', '').trim();
        }

        // Chain path (if present)
        if (line.startsWith('Chain Path:') && currentCert) {
          currentCert.chainPath = line.replace('Chain Path:', '').trim();
        }

        // Expiry date
        if (line.includes('Expiry Date:') && currentCert) {
          const expiryMatch = line.match(/Expiry Date:\s*(.+?)(?:\s+\(VALID|$)/);
          if (expiryMatch) {
            currentCert.expiryDate = expiryMatch[1].trim();
            
            // Calculate days until expiry
            try {
              const expiryDate = new Date(currentCert.expiryDate);
              const now = new Date();
              const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              currentCert.daysUntilExpiry = daysUntilExpiry;
            } catch {
              // Ignore date parsing errors
            }
          }
        }

        // Issuer
        if (line.includes('Issuer:') && currentCert) {
          const issuerMatch = line.match(/Issuer:\s*(.+)/);
          if (issuerMatch) {
            currentCert.issuer = issuerMatch[1].trim();
          }
        }
      }

      // Add last certificate
      if (currentCert && currentCert.domain) {
        certificates.push(currentCert as SSLCertificate);
      }

      return certificates;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list SSL certificates');
      throw error;
    }
  }

  /**
   * Request a new SSL certificate using certbot
   */
  async requestCertificate(
    domain: string,
    options: {
      email?: string;
      wildcard?: boolean;
      dnsChallenge?: boolean;
      webroot?: string;
    } = {},
    instanceId?: string,
  ): Promise<void> {
    try {
      let command = 'certbot certonly --non-interactive --agree-tos';

      if (options.email) {
        command += ` --email ${options.email}`;
      } else {
        command += ' --register-unsafely-without-email';
      }

      if (options.wildcard) {
        command += ` -d *.${domain} -d ${domain}`;
        if (!options.dnsChallenge) {
          throw new Error('Wildcard certificates require DNS challenge');
        }
      } else {
        command += ` -d ${domain}`;
      }

      if (options.dnsChallenge) {
        command += ' --dns-route53'; // Use Route53 DNS challenge
      } else if (options.webroot) {
        command += ` --webroot -w ${options.webroot}`;
      } else {
        command += ' --standalone'; // Default to standalone mode
      }

      await this.executeCommand(command, instanceId);
      logger.info({ domain, options }, 'SSL certificate requested');
    } catch (error) {
      logger.error({ err: error, domain, options }, 'Failed to request SSL certificate');
      throw error;
    }
  }

  /**
   * Renew all certificates
   */
  async renewAllCertificates(instanceId?: string): Promise<void> {
    try {
      await this.executeCommand('certbot renew --non-interactive', instanceId);
      logger.info('All SSL certificates renewed');
    } catch (error) {
      logger.error({ err: error }, 'Failed to renew SSL certificates');
      throw error;
    }
  }

  /**
   * Delete a certificate
   */
  async deleteCertificate(domain: string, instanceId?: string): Promise<void> {
    try {
      await this.executeCommand(`certbot delete --non-interactive --cert-name ${domain}`, instanceId);
      logger.info({ domain }, 'SSL certificate deleted');
    } catch (error) {
      logger.error({ err: error, domain }, 'Failed to delete SSL certificate');
      throw error;
    }
  }
}

