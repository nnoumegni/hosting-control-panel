"use client";

import { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { isValidDomainName } from '../../../../../lib/domain-validation';

interface AddDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (domain: { domain: string; documentRoot?: string; sslEnabled?: boolean }) => Promise<void>;
  instanceId?: string;
}

export function AddDomainModal({ isOpen, onClose, onAdd }: AddDomainModalProps) {
  const [domain, setDomain] = useState('');
  const [documentRoot, setDocumentRoot] = useState('');
  const [sslEnabled, setSslEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedDomain = domain.trim();
    
    if (!trimmedDomain) {
      setError('Domain name is required');
      return;
    }

    // Use shared domain validation function
    if (!isValidDomainName(trimmedDomain)) {
      setError('Please enter a valid domain name (e.g., example.com, www.example.com)');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd({
        domain: domain.trim(),
        documentRoot: documentRoot.trim() || undefined,
        sslEnabled,
      });
      // Reset form on success
      setDomain('');
      setDocumentRoot('');
      setSslEnabled(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add website');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setDomain('');
      setDocumentRoot('');
      setSslEnabled(false);
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Add New Website</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-slate-300 mb-2">
              Domain Name <span className="text-red-400">*</span>
            </label>
            <input
              id="domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              This will create a Route53 hosted zone and configure DNS records automatically.
            </p>
          </div>

          <div>
            <label htmlFor="documentRoot" className="block text-sm font-medium text-slate-300 mb-2">
              Document Root (optional)
            </label>
            <input
              id="documentRoot"
              type="text"
              value={documentRoot}
              onChange={(e) => setDocumentRoot(e.target.value)}
              placeholder={`/var/www/${domain || 'example.com'}`}
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-500">
              Default: <code className="text-slate-400">/var/www/&lt;domain&gt;</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="sslEnabled"
              type="checkbox"
              checked={sslEnabled}
              onChange={(e) => setSslEnabled(e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-slate-900 disabled:opacity-50"
            />
            <label htmlFor="sslEnabled" className="text-sm text-slate-300">
              Enable SSL/HTTPS
            </label>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            Configure SSL certificate paths (certificate must be installed separately using Certbot)
          </p>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-sm text-blue-400">
              <strong>Note:</strong> After adding the domain, make sure to update your domain registrar's nameservers
              to the Route53 nameservers provided when the hosted zone is created.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !domain.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Website
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

