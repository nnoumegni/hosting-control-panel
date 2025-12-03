"use client";

import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldOff, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';

interface DDoSProtectionStatus {
  instanceId: string;
  securityGroupId: string;
  enabled: boolean;
  lambdaFunctionName?: string;
  lambdaFunctionArn?: string;
  logGroupName?: string;
  requestThreshold?: number;
  blockDurationMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

interface DDoSProtectionPanelProps {
  instanceId?: string;
  securityGroupId?: string;
}

export function DDoSProtectionPanel({ instanceId, securityGroupId }: DDoSProtectionPanelProps) {
  const [status, setStatus] = useState<DDoSProtectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!instanceId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<{ status: DDoSProtectionStatus }>(
        `firewall/ddos-protection/status?instanceId=${encodeURIComponent(instanceId)}`,
      );
      setStatus(response.status || null);
    } catch (err: any) {
      if (err.status === 404) {
        setStatus(null);
      } else {
        setError(err.message || 'Failed to load DDoS protection status');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (instanceId) {
      void loadStatus();
    }
  }, [instanceId]);

  const handleEnable = async () => {
    if (!instanceId || !securityGroupId) {
      setError('Instance ID and Security Group ID are required');
      return;
    }

    setIsToggling(true);
    setError(null);
    try {
      const response = await apiFetch<{ status: DDoSProtectionStatus; message: string }>(
        'firewall/ddos-protection/enable',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceId,
            securityGroupId,
            requestThreshold: 200, // Default: 200 requests per minute
            blockDurationMinutes: 60, // Default: 60 minutes
          }),
        },
      );
      setStatus(response.status);
    } catch (err: any) {
      setError(err.message || 'Failed to enable DDoS protection');
    } finally {
      setIsToggling(false);
    }
  };

  const handleDisable = async () => {
    if (!instanceId) return;

    setIsToggling(true);
    setError(null);
    try {
      await apiFetch(`firewall/ddos-protection/disable?instanceId=${encodeURIComponent(instanceId)}`, {
        method: 'POST',
      });
      if (status) {
        setStatus({ ...status, enabled: false });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to disable DDoS protection');
    } finally {
      setIsToggling(false);
    }
  };

  if (!instanceId) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-5 w-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-white">DDoS Protection</h3>
        </div>
        <p className="text-sm text-slate-400">Select an instance to manage DDoS protection</p>
      </div>
    );
  }

  const isEnabled = status?.enabled ?? false;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <ShieldCheck className="h-5 w-5 text-green-400" />
          ) : (
            <ShieldOff className="h-5 w-5 text-slate-400" />
          )}
          <h3 className="text-lg font-semibold text-white">DDoS Protection</h3>
        </div>
        <div className="flex items-center gap-2">
          {isEnabled ? (
            <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded border border-green-500/30">
              Active
            </span>
          ) : (
            <span className="px-2 py-1 text-xs font-medium bg-slate-700 text-slate-300 rounded border border-slate-600">
              Inactive
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {status && (
            <div className="text-sm text-slate-400 space-y-2">
              {status.requestThreshold && (
                <div>
                  <span className="text-slate-500">Request Threshold:</span>{' '}
                  <span className="text-slate-300">{status.requestThreshold} requests/minute</span>
                </div>
              )}
              {status.blockDurationMinutes && (
                <div>
                  <span className="text-slate-500">Block Duration:</span>{' '}
                  <span className="text-slate-300">{status.blockDurationMinutes} minutes</span>
                </div>
              )}
              {status.logGroupName && (
                <div>
                  <span className="text-slate-500">Log Group:</span>{' '}
                  <span className="text-slate-300 font-mono text-xs">{status.logGroupName}</span>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            {isEnabled ? (
              <button
                onClick={handleDisable}
                disabled={isToggling}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isToggling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Disabling...
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-4 w-4" />
                    Disable DDoS Protection
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleEnable}
                disabled={isToggling || !securityGroupId}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isToggling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Enable DDoS Protection
                  </>
                )}
              </button>
            )}
          </div>

          {status && isEnabled && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-xs text-blue-300">
                DDoS protection is monitoring access logs and automatically blocking suspicious IPs that exceed the
                threshold. Blocked IPs are automatically unblocked after the cooldown period.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

