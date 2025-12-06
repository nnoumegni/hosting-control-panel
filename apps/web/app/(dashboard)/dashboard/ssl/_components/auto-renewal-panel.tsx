"use client";

import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, CheckCircle2, XCircle, Activity, Clock, RotateCw } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';

interface AutoRenewalStatus {
  enabled: boolean;
  running: boolean;
  checkInterval: string;
  renewalThreshold: number;
  maxRetries: number;
}

interface AutoRenewalPanelProps {
  instanceId: string;
}

export function AutoRenewalPanel({ instanceId }: AutoRenewalPanelProps) {
  const [status, setStatus] = useState<AutoRenewalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiFetch<AutoRenewalStatus>(
        `ssl/auto-renewal/status?instanceId=${encodeURIComponent(instanceId)}`
      );
      setStatus(response);
    } catch (err: any) {
      setError(err?.message || 'Failed to load auto-renewal status');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerRenewal = async () => {
    try {
      setIsTriggering(true);
      setError(null);
      setSuccess(null);
      const response = await apiFetch<{ status: string; message: string }>(
        `ssl/auto-renewal/trigger?instanceId=${encodeURIComponent(instanceId)}`,
        { method: 'POST' }
      );
      setSuccess(response.message || 'Renewal check triggered successfully');
      // Reload status after a short delay
      setTimeout(() => {
        void loadStatus();
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to trigger renewal check');
    } finally {
      setIsTriggering(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [instanceId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-4 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {status && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-400" />
              Auto-Renewal Status
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={triggerRenewal}
                disabled={isTriggering}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-sm transition disabled:opacity-50 flex items-center gap-2"
              >
                {isTriggering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Triggering...
                  </>
                ) : (
                  <>
                    <RotateCw className="h-4 w-4" />
                    Trigger Check
                  </>
                )}
              </button>
              <button
                onClick={loadStatus}
                disabled={isLoading}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm transition disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 bg-slate-800/60 rounded-lg border border-slate-700">
              <div className="flex items-center gap-3">
                {status.enabled ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-white">Auto-Renewal</div>
                  <div className="text-xs text-slate-400">
                    {status.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/60 rounded-lg border border-slate-700">
              <div className="flex items-center gap-3">
                {status.running ? (
                  <Activity className="h-5 w-5 text-emerald-400 animate-pulse" />
                ) : (
                  <Clock className="h-5 w-5 text-slate-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-white">Status</div>
                  <div className="text-xs text-slate-400">
                    {status.running ? 'Running' : 'Idle'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/60 rounded-lg border border-slate-700">
              <div>
                <div className="text-sm font-medium text-white">Check Interval</div>
                <div className="text-xs text-slate-400 mt-1">{status.checkInterval}</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/60 rounded-lg border border-slate-700">
              <div>
                <div className="text-sm font-medium text-white">Renewal Threshold</div>
                <div className="text-xs text-slate-400 mt-1">
                  {status.renewalThreshold} days before expiry
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-800/60 rounded-lg border border-slate-700 md:col-span-2">
              <div>
                <div className="text-sm font-medium text-white">Max Retries</div>
                <div className="text-xs text-slate-400 mt-1">
                  {status.maxRetries} attempts with exponential backoff
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
            <p className="text-xs text-slate-400">
              <strong className="text-slate-300">Note:</strong> The agent automatically checks for certificates
              expiring within {status.renewalThreshold} days and renews them using the same challenge method
              (HTTP-01 or DNS-01) that was used during issuance. No manual intervention required!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}



