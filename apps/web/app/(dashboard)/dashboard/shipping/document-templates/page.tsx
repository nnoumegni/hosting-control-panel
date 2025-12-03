"use client";

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { shippingApiFetch, type DocumentTemplate, type Page } from '../../../../../lib/shipping-api';

export default function DocumentTemplatesPage() {
  const [templates, setTemplates] = useState<Page<DocumentTemplate> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApiFetch<Page<DocumentTemplate>>('v1/document-templates?limit=50');
      setTemplates({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document templates');
      setTemplates(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Document Templates</h1>
          <p className="text-sm text-slate-400 mt-1">Manage document templates</p>
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
      ) : templates && templates.results && templates.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Name</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Slug</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Related Object</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(templates.results || []).map((template) => (
                <tr key={template.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200">{template.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{template.slug || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{template.related_object || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      template.active ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40' :
                      'bg-slate-500/10 text-slate-200 border border-slate-500/40'
                    }`}>
                      {template.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">No document templates found.</p>
        </div>
      )}
    </div>
  );
}

