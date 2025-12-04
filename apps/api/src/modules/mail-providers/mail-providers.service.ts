import { encryptSecret } from '@hosting/common';
import type { MailProviderRepository } from './mail-providers.repository.js';
import type { DnsStatusRepository } from './dns-status.repository.js';
import { DnsDetectionService } from './dns-detection.service.js';
import { DnsValidationService } from './dns-validation.service.js';
import { GoogleWorkspaceService } from './google-workspace.service.js';
import { Microsoft365Service } from './microsoft365.service.js';
import type { DomainRepository } from '../domains/domain.repository.js';

export interface ValidateProviderInput {
  domainId: string;
  providerType: 'GOOGLE_WORKSPACE' | 'MICROSOFT_365';
  credentials: {
    google?: {
      serviceAccountJson: string;
      delegatedAdmin: string;
    };
    microsoft365?: {
      tenantId: string;
      clientId: string;
      clientSecret: string;
    };
  };
}

export interface FixDnsInput {
  domainId: string;
  records: Array<{
    name: string;
    type: string;
    ttl: number;
    values: string[];
  }>;
}

export class MailProvidersService {
  constructor(
    private readonly mailProviderRepository: MailProviderRepository,
    private readonly dnsStatusRepository: DnsStatusRepository,
    private readonly domainRepository: DomainRepository,
    private readonly dnsDetectionService: DnsDetectionService,
    private readonly dnsValidationService: DnsValidationService,
    private readonly googleWorkspaceService: GoogleWorkspaceService,
    private readonly microsoft365Service: Microsoft365Service,
    private readonly credentialPassphrase: string,
  ) {}

  /**
   * Detect email provider from DNS records
   */
  async detectProvider(domainId: string) {
    const domain = await this.domainRepository.findById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const detection = await this.dnsDetectionService.detectProvider(domain.domain);
    return detection;
  }

  /**
   * Validate and store provider credentials
   */
  async validateProvider(input: ValidateProviderInput) {
    const domain = await this.domainRepository.findById(input.domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    // Encrypt credentials
    let encryptedCredentials: string;
    let config: any = {};

    if (input.providerType === 'GOOGLE_WORKSPACE' && input.credentials.google) {
      const credentialsJson = JSON.stringify({
        serviceAccountJson: input.credentials.google.serviceAccountJson,
        delegatedAdmin: input.credentials.google.delegatedAdmin,
      });
      encryptedCredentials = encryptSecret(credentialsJson, this.credentialPassphrase);
      config = { google: { delegatedAdmin: input.credentials.google.delegatedAdmin } };

      // Validate credentials
      const isValid = await this.googleWorkspaceService.validateCredentials(
        encryptedCredentials,
        this.credentialPassphrase,
      );
      if (!isValid) {
        throw new Error('Invalid Google Workspace credentials');
      }
    } else if (input.providerType === 'MICROSOFT_365' && input.credentials.microsoft365) {
      const credentialsJson = JSON.stringify({
        tenantId: input.credentials.microsoft365.tenantId,
        clientId: input.credentials.microsoft365.clientId,
        clientSecret: input.credentials.microsoft365.clientSecret,
      });
      encryptedCredentials = encryptSecret(credentialsJson, this.credentialPassphrase);
      config = {
        microsoft365: {
          tenantId: input.credentials.microsoft365.tenantId,
          clientId: input.credentials.microsoft365.clientId,
        },
      };

      // Validate credentials
      const isValid = await this.microsoft365Service.validateCredentials(
        encryptedCredentials,
        this.credentialPassphrase,
      );
      if (!isValid) {
        throw new Error('Invalid Microsoft 365 credentials');
      }
    } else {
      throw new Error('Invalid provider type or missing credentials');
    }

    // Check if provider already exists
    const existing = await this.mailProviderRepository.findByDomainId(input.domainId);
    if (existing) {
      // Update existing provider
      const updated = await this.mailProviderRepository.update(existing._id, {
        config,
        encryptedCredentials,
        status: 'ACTIVE',
      });
      if (!updated) {
        throw new Error('Failed to update provider');
      }
      return updated;
    }

    // Create new provider
    const provider = await this.mailProviderRepository.create({
      domainId: input.domainId,
      providerType: input.providerType,
      config,
      encryptedCredentials,
    });

    // Validate DNS after creating provider
    await this.checkDnsStatus(input.domainId);

    return provider;
  }

  /**
   * Get DNS status for a domain
   */
  async getDnsStatus(domainId: string) {
    const domain = await this.domainRepository.findById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      throw new Error('No email provider configured for this domain');
    }

    // Check DNS status
    return this.checkDnsStatus(domainId);
  }

  /**
   * Check and update DNS status
   */
  private async checkDnsStatus(domainId: string) {
    const domain = await this.domainRepository.findById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      throw new Error('No email provider configured for this domain');
    }

    const validation = await this.dnsValidationService.validateDns(domain.domain, provider.providerType);

    // Update DNS status
    const dnsStatus = await this.dnsStatusRepository.upsertByDomainId(domainId, {
      domainId,
      mxValid: validation.mxValid,
      spfValid: validation.spfValid,
      dkimValid: validation.dkimValid,
      dmarcValid: validation.dmarcValid,
      overallStatus: validation.overallStatus,
    });

    return {
      ...dnsStatus,
      details: validation.details,
    };
  }

  /**
   * Get provider for a domain
   */
  async getProvider(domainId: string) {
    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      return null;
    }

    // Don't return encrypted credentials
    const { encryptedCredentials, ...publicProvider } = provider;
    return publicProvider;
  }

  /**
   * List users for a domain
   */
  async listUsers(domainId: string) {
    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      throw new Error('No email provider configured for this domain');
    }

    const domain = await this.domainRepository.findById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    if (provider.providerType === 'GOOGLE_WORKSPACE') {
      if (!provider.encryptedCredentials) {
        throw new Error('Provider credentials not found');
      }
      return this.googleWorkspaceService.listUsers(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        domain.domain,
      );
    } else if (provider.providerType === 'MICROSOFT_365') {
      if (!provider.encryptedCredentials) {
        throw new Error('Provider credentials not found');
      }
      return this.microsoft365Service.listUsers(provider.encryptedCredentials, this.credentialPassphrase);
    }

    throw new Error('Unsupported provider type');
  }

  /**
   * Create a user
   */
  async createUser(domainId: string, userInput: any) {
    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      throw new Error('No email provider configured for this domain');
    }

    if (!provider.encryptedCredentials) {
      throw new Error('Provider credentials not found');
    }

    if (provider.providerType === 'GOOGLE_WORKSPACE') {
      return this.googleWorkspaceService.createUser(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userInput,
      );
    } else if (provider.providerType === 'MICROSOFT_365') {
      return this.microsoft365Service.createUser(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userInput,
      );
    }

    throw new Error('Unsupported provider type');
  }

  /**
   * Update a user
   */
  async updateUser(domainId: string, userId: string, userInput: any) {
    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      throw new Error('No email provider configured for this domain');
    }

    if (!provider.encryptedCredentials) {
      throw new Error('Provider credentials not found');
    }

    if (provider.providerType === 'GOOGLE_WORKSPACE') {
      return this.googleWorkspaceService.updateUser(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userId,
        userInput,
      );
    } else if (provider.providerType === 'MICROSOFT_365') {
      return this.microsoft365Service.updateUser(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userId,
        userInput,
      );
    }

    throw new Error('Unsupported provider type');
  }

  /**
   * Delete a user
   */
  async deleteUser(domainId: string, userId: string) {
    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      throw new Error('No email provider configured for this domain');
    }

    if (!provider.encryptedCredentials) {
      throw new Error('Provider credentials not found');
    }

    if (provider.providerType === 'GOOGLE_WORKSPACE') {
      return this.googleWorkspaceService.deleteUser(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userId,
      );
    } else if (provider.providerType === 'MICROSOFT_365') {
      return this.microsoft365Service.deleteUser(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userId,
      );
    }

    throw new Error('Unsupported provider type');
  }

  /**
   * Reset user password
   */
  async resetPassword(domainId: string, userId: string, newPassword: string) {
    const provider = await this.mailProviderRepository.findByDomainId(domainId);
    if (!provider) {
      throw new Error('No email provider configured for this domain');
    }

    if (!provider.encryptedCredentials) {
      throw new Error('Provider credentials not found');
    }

    if (provider.providerType === 'GOOGLE_WORKSPACE') {
      return this.googleWorkspaceService.resetPassword(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userId,
        newPassword,
      );
    } else if (provider.providerType === 'MICROSOFT_365') {
      return this.microsoft365Service.resetPassword(
        provider.encryptedCredentials,
        this.credentialPassphrase,
        userId,
        newPassword,
      );
    }

    throw new Error('Unsupported provider type');
  }
}

