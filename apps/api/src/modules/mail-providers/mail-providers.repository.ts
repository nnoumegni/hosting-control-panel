export type MailProviderType = 'GOOGLE_WORKSPACE' | 'MICROSOFT_365';

export type MailProviderStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING';

export interface MailProviderConfig {
  google?: {
    delegatedAdmin: string;
  };
  microsoft365?: {
    tenantId: string;
    clientId: string;
  };
}

export interface MailProvider {
  _id: string;
  domainId: string;
  providerType: MailProviderType;
  status: MailProviderStatus;
  config: MailProviderConfig;
  encryptedCredentials: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface CreateMailProviderInput {
  domainId: string;
  providerType: MailProviderType;
  config: MailProviderConfig;
  encryptedCredentials: string;
}

export interface UpdateMailProviderInput {
  status?: MailProviderStatus;
  config?: MailProviderConfig;
  encryptedCredentials?: string | null;
}

export interface MailProviderRepository {
  create(input: CreateMailProviderInput): Promise<MailProvider>;
  findById(id: string): Promise<MailProvider | null>;
  findByDomainId(domainId: string): Promise<MailProvider | null>;
  update(id: string, input: UpdateMailProviderInput): Promise<MailProvider | null>;
  delete(id: string): Promise<void>;
  deleteByDomainId(domainId: string): Promise<void>;
}

