"use client";

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { shippingApiFetch, type Webhook, type Page } from '../../../../../lib/shipping-api';

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Page<Webhook> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWebhooks = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApiFetch<Page<Webhook>>('v1/webhooks?limit=50');
      setWebhooks({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
      setWebhooks(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadWebhooks();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Webhooks</h1>
          <p className="text-sm text-slate-400 mt-1">Manage webhook endpoints</p>
        </div>
        <button
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          Add Webhook
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : webhooks && webhooks.results && webhooks.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">URL</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Events</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-right text-slate-400 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(webhooks.results || []).map((webhook) => (
                <tr key={webhook.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">{webhook.url || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {webhook.enabled_events?.length || 0} event(s)
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      webhook.disabled ? 'bg-rose-500/10 text-rose-200 border border-rose-500/40' :
                      'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40'
                    }`}>
                      {webhook.disabled ? 'Disabled' : 'Enabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">No webhooks found. Create your first webhook to get started.</p>
        </div>
      )}
    </div>
  );
}

