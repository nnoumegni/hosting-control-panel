"use client";

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';

interface BillingOverview {
  totalCost: number;
  startDate: string;
  endDate: string;
  budget: {
    limit: number;
    spent: number;
    remaining: number;
    percentUsed: number;
    status: string;
  };
  forecast: {
    cost: number;
    date: string;
  };
  costByService: Array<{
    service: string;
    cost: number;
    percent: number;
  }>;
}

export default function BillingPage() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const overview = await apiFetch<BillingOverview>('billing/overview');
        setData(overview);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load billing data';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">AWS Billing Overview</h1>
          <p className="text-sm text-slate-400">Your AWS account cost summary and forecast</p>
        </header>
        <div className="text-center py-12 text-slate-400">Loading billing data...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">AWS Billing Overview</h1>
          <p className="text-sm text-slate-400">Your AWS account cost summary and forecast</p>
        </header>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
          {error ?? 'Failed to load billing data'}
        </div>
      </div>
    );
  }

  const budgetStatusColor =
    data.budget.percentUsed > 90
      ? 'text-rose-400 font-bold'
      : data.budget.status === 'Within Budget'
        ? 'text-emerald-400'
        : 'text-slate-300';
  const budgetBarColor = data.budget.percentUsed > 90 ? 'bg-rose-500' : 'bg-emerald-500';

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">AWS Billing Overview</h1>
        <p className="text-sm text-slate-400">Your AWS account cost summary and forecast</p>
      </header>

      <section className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {/* Total Cost Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-center">
          <h2 className="text-slate-400 font-semibold uppercase tracking-wide text-xs mb-2">
            Total Cost (This Month)
          </h2>
          <p className="text-4xl font-extrabold text-emerald-400">${data.totalCost.toFixed(2)}</p>
          <p className="text-slate-500 mt-1 text-xs">
            {data.startDate} - {data.endDate}
          </p>
        </div>

        {/* Budget Status */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-center">
          <h2 className="text-slate-400 font-semibold uppercase tracking-wide text-xs mb-2">Budget Status</h2>
          <div className={`text-xl font-semibold ${budgetStatusColor}`}>{data.budget.status}</div>
          <div className="w-full bg-slate-800 rounded-full h-4 mt-4">
            <div
              className={`${budgetBarColor} h-4 rounded-full transition-all`}
              style={{ width: `${Math.min(100, data.budget.percentUsed)}%` }}
            />
          </div>
          <p className="mt-2 text-slate-500 text-xs">
            Spent ${data.budget.spent.toFixed(2)} of ${data.budget.limit > 0 ? `$${data.budget.limit.toFixed(2)}` : 'N/A'} budget
          </p>
        </div>

        {/* Forecasted Cost */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-center">
          <h2 className="text-slate-400 font-semibold uppercase tracking-wide text-xs mb-2">
            Forecasted Cost (End of Month)
          </h2>
          <p className="text-3xl font-bold text-amber-400">${data.forecast.cost.toFixed(2)}</p>
          <p className="text-slate-500 mt-1 text-xs">Forecasted as of {data.forecast.date}</p>
        </div>
      </section>

      {/* Cost by Service Chart */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-slate-200 text-xl font-semibold mb-4">Cost Breakdown by Service</h2>
        <div className="space-y-4">
          {data.costByService.length === 0 ? (
            <p className="text-slate-400 italic">No service costs available</p>
          ) : (
            data.costByService.map((service) => (
              <div key={service.service} className="flex items-center justify-between">
                <span className="text-slate-200 font-medium">{service.service}</span>
                <span className="font-semibold text-slate-100">${service.cost.toFixed(2)}</span>
                <div className="w-1/2 bg-slate-800 rounded-full h-4 ml-4">
                  <div
                    className="bg-blue-500 h-4 rounded-full"
                    style={{ width: `${service.percent}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Simple line chart placeholder */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-slate-200 text-xl font-semibold mb-4">Cost Trend (Last 7 Days)</h2>
        <div className="w-full h-48 bg-slate-800/50 rounded-lg flex items-center justify-center text-slate-400 italic">
          Chart placeholder
        </div>
      </section>
    </div>
  );
}

