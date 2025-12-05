"use client";

import { useState, useEffect } from 'react';
import { apiFetch } from '../../../../lib/api';
import { getSelectedInstanceId } from '../../../../lib/instance-utils';
import Link from 'next/link';

interface RequirementResult {
  key: string;
  label: string;
  status: 'OK' | 'WARN' | 'ERROR';
  details?: string;
  fixHint?: string;
}

interface RequirementsReport {
  ok: boolean;
  report: {
    os: string;
    kernel: string;
    hasErrors: boolean;
    hasWarnings: boolean;
    checkedAt: string;
    results: RequirementResult[];
    nftConfigPath?: string;
  };
  error?: string;
}

export function SoftwareStatusBadge() {
  const [statusCounts, setStatusCounts] = useState({ OK: 0, WARN: 0, ERROR: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      const instanceId = getSelectedInstanceId();
      if (!instanceId) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await apiFetch<RequirementsReport>(
          `gateway/requirements?instanceId=${encodeURIComponent(instanceId)}`
        );
        
        const counts = data.report.results.reduce((acc, req) => {
          acc[req.status] = (acc[req.status] || 0) + 1;
          return acc;
        }, { OK: 0, WARN: 0, ERROR: 0 } as Record<string, number>);
        
        setStatusCounts({
          OK: counts.OK || 0,
          WARN: counts.WARN || 0,
          ERROR: counts.ERROR || 0,
        });
      } catch (error) {
        // Silently fail - don't show errors in the nav
        console.warn('Failed to load software status', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadStatus();

    // Listen for instance changes
    const handleInstanceChange = () => {
      void loadStatus();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleInstanceChange);
      window.addEventListener('ec2-instance-selected', handleInstanceChange);

      return () => {
        window.removeEventListener('storage', handleInstanceChange);
        window.removeEventListener('ec2-instance-selected', handleInstanceChange);
      };
    }
  }, []);

  return (
    <Link
      href="/dashboard/system-status"
      className="w-full rounded-md border border-slate-800 bg-slate-800/50 p-4 text-xs text-slate-400 hover:bg-slate-800/70 transition block"
    >
      <div className="flex items-center gap-2">
        <span>Softwares:</span>
        {isLoading ? (
          <span className="text-slate-500">Loading...</span>
        ) : (
          <>
            {statusCounts.OK > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium whitespace-nowrap">
                {statusCounts.OK}
              </span>
            )}
            {statusCounts.WARN > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium whitespace-nowrap">
                {statusCounts.WARN}
              </span>
            )}
            {statusCounts.ERROR > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium whitespace-nowrap">
                {statusCounts.ERROR}
              </span>
            )}
            {statusCounts.OK === 0 && statusCounts.WARN === 0 && statusCounts.ERROR === 0 && (
              <span className="text-slate-500 text-xs">No data</span>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

