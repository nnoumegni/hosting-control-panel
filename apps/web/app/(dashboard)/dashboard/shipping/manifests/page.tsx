"use client";

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { shippingApiFetch, type Manifest, type Page } from '../../../../../lib/shipping-api';

export default function ManifestsPage() {
  const [manifests, setManifests] = useState<Page<Manifest> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadManifests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApiFetch<Page<Manifest>>('v1/manifests?limit=50');
      setManifests({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manifests');
      setManifests(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadManifests();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Manifests</h1>
          <p className="text-sm text-slate-400 mt-1">Manage shipping manifests</p>
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
      ) : manifests && manifests.results && manifests.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">ID</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Carrier</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Shipments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(manifests.results || []).map((manifest) => (
                <tr key={manifest.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">
                    {manifest.id?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{manifest.carrier_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {manifest.shipment_ids?.length || 0} shipment(s)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">No manifests found.</p>
        </div>
      )}
    </div>
  );
}

