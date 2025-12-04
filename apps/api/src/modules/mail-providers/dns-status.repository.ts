export type DnsValidationStatus = 'PASS' | 'WARN' | 'FAIL';

export interface DnsStatus {
  _id: string;
  domainId: string;
  mxValid: boolean;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  overallStatus: DnsValidationStatus;
  lastCheckedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDnsStatusInput {
  domainId: string;
  mxValid: boolean;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  overallStatus: DnsValidationStatus;
}

export interface UpdateDnsStatusInput {
  mxValid?: boolean;
  spfValid?: boolean;
  dkimValid?: boolean;
  dmarcValid?: boolean;
  overallStatus?: DnsValidationStatus;
}

export interface DnsStatusRepository {
  create(input: CreateDnsStatusInput): Promise<DnsStatus>;
  findById(id: string): Promise<DnsStatus | null>;
  findByDomainId(domainId: string): Promise<DnsStatus | null>;
  update(id: string, input: UpdateDnsStatusInput): Promise<DnsStatus | null>;
  upsertByDomainId(domainId: string, input: CreateDnsStatusInput | UpdateDnsStatusInput): Promise<DnsStatus>;
  delete(id: string): Promise<void>;
  deleteByDomainId(domainId: string): Promise<void>;
}

