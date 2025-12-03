import type { HostingAccount, HostingPlan, PaginationQuery } from '@hosting/common';
import type { ObjectId } from 'mongodb';

export interface CreatePlanInput {
  name: string;
  description?: string;
  diskQuotaMb: number;
  bandwidthQuotaGb: number;
  maxDomains: number;
  maxDatabases: number;
  maxEmailAccounts: number;
  priceMonthly: number;
}

export interface UpdatePlanInput extends Partial<CreatePlanInput> {}

export interface CreateAccountInput {
  username: string;
  primaryDomain: string;
  planId: string;
  ownerId: string;
  ownerRole: HostingAccount['ownerRole'];
  metadata?: HostingAccount['metadata'];
}

export interface UpdateAccountInput {
  primaryDomain?: string;
  planId?: string;
  status?: HostingAccount['status'];
  metadata?: HostingAccount['metadata'];
  suspendedAt?: Date | null;
}

export interface ListAccountsFilters {
  ownerId?: string;
  status?: HostingAccount['status'];
  pagination: PaginationQuery;
}

export interface AccountsRepository {
  createPlan(input: CreatePlanInput): Promise<HostingPlan>;
  updatePlan(id: string, input: UpdatePlanInput): Promise<HostingPlan | null>;
  deletePlan(id: string): Promise<boolean>;
  getPlanById(id: string): Promise<HostingPlan | null>;
  listPlans(): Promise<HostingPlan[]>;

  createAccount(input: CreateAccountInput): Promise<HostingAccount>;
  updateAccount(id: string, input: UpdateAccountInput): Promise<HostingAccount | null>;
  getAccountById(id: string): Promise<HostingAccount | null>;
  getAccountByUsername(username: string): Promise<HostingAccount | null>;
  listAccounts(filters: ListAccountsFilters): Promise<{ items: HostingAccount[]; total: number }>;
  deleteAccount(id: string): Promise<boolean>;
}

export type MongoId = ObjectId;


