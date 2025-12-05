"use client";

import { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';
import { isValidDomainName } from '../../../../../lib/domain-validation';

interface AddHostedZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddHostedZoneModal({ isOpen, onClose, onSuccess }: AddHostedZoneModalProps) {
  const [domain, setDomain] = useState('');
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
      setError('Please enter a valid domain name (e.g., example.com)');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch<{ success: boolean; zoneId: string; nameServers: string[]; message: string }>(
        'domains/dns/zones',
        {
          method: 'POST',
          body: JSON.stringify({
            domain: trimmedDomain,
          }),
        }
      );

      // Reset form on success
      setDomain('');
      setError(null);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.data?.error || err?.message || 'Failed to create hosted zone';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setDomain('');
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-800 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Add Hosted Zone</h2>
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
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-200">{error}</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-slate-300 mb-2">
              Domain Name
            </label>
            <input
              id="domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
            />
            <p className="text-xs text-slate-400 mt-1">
              Enter the domain name for the hosted zone (e.g., example.com)
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
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Hosted Zone'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

