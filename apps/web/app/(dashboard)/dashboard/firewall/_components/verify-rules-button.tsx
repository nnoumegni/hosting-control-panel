"use client";

import { useState } from 'react';

import { apiFetch } from '../../../../../lib/api';

interface VerifyRulesButtonProps {
  onVerified: () => void;
}

interface VerifyResponse {
  success: boolean;
  verified: number;
  updated: number;
  errors: number;
  errorMessages?: string[];
  message?: string;
  totalRules?: number;
}

export function VerifyRulesButton({ onVerified }: VerifyRulesButtonProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleVerify = async () => {
    setIsVerifying(true);
    setMessage(null);

    try {
      const result = await apiFetch<VerifyResponse>('firewall/verify', {
        method: 'POST',
      });

      if (result.success) {
        // Check for errors first
        if (result.errors > 0) {
          const errorDetails = result.errorMessages && result.errorMessages.length > 0
            ? result.errorMessages.join('. ')
            : 'Unknown error occurred.';
          setMessage({
            type: 'error',
            text: errorDetails,
          });
        } else if (result.verified === 0 && result.totalRules === 0) {
          // Only show "no rules" message if there are actually no rules in the database
          setMessage({
            type: 'success',
            text: 'No firewall rules to verify.',
          });
        } else if (result.verified === 0) {
          // Rules exist but none were verified (all disabled or not applicable)
          setMessage({
            type: 'success',
            text: `Verification completed. ${result.updated > 0 ? `${result.updated} status${result.updated === 1 ? '' : 'es'} updated.` : 'No changes needed.'}`,
          });
        } else {
          setMessage({
            type: 'success',
            text: `Verified ${result.verified} rule${result.verified === 1 ? '' : 's'}. ${result.updated > 0 ? `${result.updated} status${result.updated === 1 ? '' : 'es'} updated.` : 'All rules are in sync.'}`,
          });
        }
        onVerified();
      } else {
        const errorDetails = result.errorMessages && result.errorMessages.length > 0
          ? result.errorMessages.join('. ')
          : result.message || 'Verification failed';
        setMessage({
          type: 'error',
          text: errorDetails,
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to verify rules',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleVerify}
        disabled={isVerifying}
        className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isVerifying ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            Verifying...
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Verify sync status
          </>
        )}
      </button>
      {message && (
        <div
          className={`rounded-md border px-3 py-2 text-xs max-w-md ${
            message.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

