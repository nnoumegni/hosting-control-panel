export interface Domain {
  _id?: string;
  domain: string;
  instanceId: string;
  hostedZoneId: string;
  publicIp: string;
  documentRoot: string;
  webServerType: 'nginx' | 'apache';
  configPath: string;
  sslEnabled: boolean;
  sslCertificatePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDomainInput {
  domain: string;
  instanceId: string;
  publicIp: string;
  documentRoot?: string;
  webServerType: 'nginx' | 'apache';
  sslEnabled?: boolean;
}

export interface UpdateDomainInput {
  documentRoot?: string;
  sslEnabled?: boolean;
  sslCertificatePath?: string;
}

export interface DomainRepository {
  create(input: CreateDomainInput & { hostedZoneId: string; configPath: string }): Promise<Domain>;
  findById(id: string): Promise<Domain | null>;
  findByDomain(domain: string): Promise<Domain | null>;
  findByInstanceId(instanceId: string): Promise<Domain[]>;
  listAll(): Promise<Domain[]>;
  update(id: string, input: UpdateDomainInput): Promise<Domain | null>;
  delete(id: string): Promise<void>;
  deleteByDomain(domain: string): Promise<void>;
}

