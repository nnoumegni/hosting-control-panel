import type { Role } from './auth.js';

export type ServiceStatus = 'active' | 'suspended' | 'pending' | 'deprovisioned';

export interface HostingPlan {
  id: string;
  name: string;
  description?: string;
  diskQuotaMb: number;
  bandwidthQuotaGb: number;
  maxDomains: number;
  maxDatabases: number;
  maxEmailAccounts: number;
  priceMonthly: number;
  createdAt: string;
  updatedAt: string;
}

export interface HostingAccount {
  id: string;
  username: string;
  primaryDomain: string;
  planId: string;
  ownerId: string;
  ownerRole: Role;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ProvisioningJob {
  id: string;
  accountId: string;
  type: 'create_account' | 'update_account' | 'suspend_account' | 'delete_account';
  status: 'queued' | 'in_progress' | 'succeeded' | 'failed';
  requestedBy: string;
  requestedRole: Role;
  requestedAt: string;
  completedAt?: string;
  details?: Record<string, unknown>;
  errorMessage?: string;
}


