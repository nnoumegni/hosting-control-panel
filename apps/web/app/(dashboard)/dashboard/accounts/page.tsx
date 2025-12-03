import type { HostingAccount, HostingPlan } from '@hosting/common';
import Link from 'next/link';

import { apiFetch } from '../../../../lib/api';

interface AccountsResponse {
  items: HostingAccount[];
  total: number;
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
}

interface PlansResponse {
  items: HostingPlan[];
}

async function getAccounts(): Promise<AccountsResponse> {
  return apiFetch<AccountsResponse>('accounts?page=1&pageSize=25');
}

async function getPlans(): Promise<PlansResponse> {
  return apiFetch<PlansResponse>('accounts/plans');
}

export default async function AccountsPage() {
  let accounts: AccountsResponse;
  let plans: PlansResponse;

  try {
    [accounts, plans] = await Promise.all([getAccounts(), getPlans()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load data';
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">Accounts</h1>
          <p className="text-sm text-slate-400">
            Review hosting accounts, their plan assignments, and provisioning status.
          </p>
        </header>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
          Unable to load accounts from the API. {message}
        </div>
      </div>
    );
  }

  const planById = new Map(plans.items.map((plan) => [plan.id, plan]));

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Accounts</h1>
        <p className="text-sm text-slate-400">
          Review hosting accounts, their plan assignments, and provisioning status.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Account roster</h2>
            <p className="text-xs text-slate-400">
              Showing {accounts.items.length} of {accounts.total} accounts (page {accounts.meta.page} of{' '}
              {accounts.meta.pageCount}).
            </p>
          </div>
          <Link
            href="/dashboard/accounts/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand/90"
          >
            Create account
          </Link>
        </div>

        {accounts.items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            No hosting accounts found. Create an account to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Username</th>
                  <th className="px-6 py-3 font-medium">Primary domain</th>
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 font-medium">Owner</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {accounts.items.map((account) => {
                  const plan = planById.get(account.planId);
                  return (
                    <tr key={account.id} className="hover:bg-slate-900/60">
                      <td className="px-6 py-3 font-medium text-white">{account.username}</td>
                      <td className="px-6 py-3 text-slate-300">{account.primaryDomain}</td>
                      <td className="px-6 py-3 text-slate-300">{plan?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-slate-300">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-200">{account.ownerId}</span>
                          <span className="text-xs uppercase tracking-wide text-slate-500">{account.ownerRole}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center rounded-full bg-slate-800/70 px-3 py-1 text-xs font-semibold capitalize text-slate-200">
                          {account.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-400">
                        {new Date(account.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

