import type { HostingAccount, HostingPlan, PaginationQuery } from '@hosting/common';
import { paginationMeta } from '@hosting/common';

import { NotFoundError } from '../../shared/errors.js';
import type {
  AccountsRepository,
  CreateAccountInput,
  CreatePlanInput,
  ListAccountsFilters,
  UpdateAccountInput,
  UpdatePlanInput,
} from './accounts.repository.js';

export class AccountsService {
  constructor(private readonly repository: AccountsRepository) {}

  async listPlans(): Promise<HostingPlan[]> {
    return this.repository.listPlans();
  }

  async createPlan(input: CreatePlanInput): Promise<HostingPlan> {
    return this.repository.createPlan(input);
  }

  async updatePlan(id: string, input: UpdatePlanInput): Promise<HostingPlan> {
    const updated = await this.repository.updatePlan(id, input);
    if (!updated) {
      throw new NotFoundError('Hosting plan not found');
    }
    return updated;
  }

  async deletePlan(id: string): Promise<void> {
    const deleted = await this.repository.deletePlan(id);
    if (!deleted) {
      throw new NotFoundError('Hosting plan not found');
    }
  }

  async getPlanById(id: string): Promise<HostingPlan> {
    const plan = await this.repository.getPlanById(id);
    if (!plan) {
      throw new NotFoundError('Hosting plan not found');
    }
    return plan;
  }

  async listAccounts(filters: Omit<ListAccountsFilters, 'pagination'> & { pagination: PaginationQuery }) {
    const result = await this.repository.listAccounts(filters);
    return {
      items: result.items,
      total: result.total,
      meta: paginationMeta(result.total, filters.pagination),
    };
  }

  async getAccountById(id: string): Promise<HostingAccount> {
    const account = await this.repository.getAccountById(id);
    if (!account) {
      throw new NotFoundError('Hosting account not found');
    }
    return account;
  }

  async createAccount(input: CreateAccountInput): Promise<HostingAccount> {
    // ensure plan exists
    const plan = await this.repository.getPlanById(input.planId);
    if (!plan) {
      throw new NotFoundError('Hosting plan not found');
    }
    return this.repository.createAccount(input);
  }

  async updateAccount(id: string, input: UpdateAccountInput): Promise<HostingAccount> {
    if (input.planId) {
      const plan = await this.repository.getPlanById(input.planId);
      if (!plan) {
        throw new NotFoundError('Hosting plan not found');
      }
    }

    const updated = await this.repository.updateAccount(id, input);
    if (!updated) {
      throw new NotFoundError('Hosting account not found');
    }
    return updated;
  }

  async deleteAccount(id: string): Promise<void> {
    const deleted = await this.repository.deleteAccount(id);
    if (!deleted) {
      throw new NotFoundError('Hosting account not found');
    }
  }
}
