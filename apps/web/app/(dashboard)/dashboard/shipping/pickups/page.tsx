"use client";

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { shippingApiFetch, type Pickup, type Page } from '../../../../../lib/shipping-api';

export default function PickupsPage() {
  const [pickups, setPickups] = useState<Page<Pickup> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPickups = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApiFetch<Page<Pickup>>('v1/pickups?limit=50');
      setPickups({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pickups');
      setPickups(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPickups();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Pickups</h1>
          <p className="text-sm text-slate-400 mt-1">Manage carrier pickups</p>
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
      ) : pickups && pickups.results && pickups.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Confirmation Number</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Carrier</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Pickup Date</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(pickups.results || []).map((pickup) => (
                <tr key={pickup.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">
                    {pickup.confirmation_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{pickup.carrier_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{pickup.pickup_date || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-slate-500/10 text-slate-200 border border-slate-500/40">
                      {pickup.status || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">No pickups found.</p>
        </div>
      )}
    </div>
  );
}

