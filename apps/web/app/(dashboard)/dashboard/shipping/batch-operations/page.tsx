"use client";

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { shippingApiFetch, type BatchOperation, type Page } from '../../../../../lib/shipping-api';

export default function BatchOperationsPage() {
  const [operations, setOperations] = useState<Page<BatchOperation> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOperations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApiFetch<Page<BatchOperation>>('v1/batch-operations?limit=50');
      setOperations({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load batch operations');
      setOperations(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOperations();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Batch Operations</h1>
          <p className="text-sm text-slate-400 mt-1">View batch operation history</p>
        </div>
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
      ) : operations && operations.results && operations.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">ID</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Resource Type</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Resources</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(operations.results || []).map((operation) => (
                <tr key={operation.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">
                    {operation.id?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      operation.status === 'completed' ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40' :
                      operation.status === 'failed' ? 'bg-rose-500/10 text-rose-200 border border-rose-500/40' :
                      'bg-slate-500/10 text-slate-200 border border-slate-500/40'
                    }`}>
                      {operation.status || 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{operation.resource_type || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {operation.resources?.length || 0} resource(s)
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {operation.created_at ? new Date(operation.created_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">No batch operations found.</p>
        </div>
      )}
    </div>
  );
}

