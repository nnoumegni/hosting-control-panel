"use client";

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { gatewayApi } from '../../../../../lib/gateway-api';
import { getSelectedInstanceId } from '../../../../../lib/instance-utils';
import type { GatewayStatus, FirewallRules, GatewayStats } from '@hosting/common';

export function GatewayStatusPanel() {
  // Get selected instance ID using the same pattern as other dashboard components
  // Also listen for changes like the firewall page does
  const [instanceId, setInstanceId] = useState<string | null>(() => getSelectedInstanceId());

  useEffect(() => {
    const currentInstanceId = getSelectedInstanceId();
    setInstanceId(currentInstanceId);
    
    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setInstanceId(newInstanceId);
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

  const statusQuery = useQuery({
    queryKey: ['gateway', 'status', instanceId],
    queryFn: () => {
      if (!instanceId) throw new Error('No EC2 instance selected');
      return gatewayApi.getStatus(instanceId);
    },
    enabled: !!instanceId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const rulesQuery = useQuery({
    queryKey: ['gateway', 'rules', instanceId],
    queryFn: () => {
      if (!instanceId) throw new Error('No EC2 instance selected');
      return gatewayApi.getRules(instanceId);
    },
    enabled: !!instanceId,
    refetchInterval: 30000,
  });

  const statsQuery = useQuery({
    queryKey: ['gateway', 'stats', instanceId],
    queryFn: () => {
      if (!instanceId) throw new Error('No EC2 instance selected');
      return gatewayApi.getStats(instanceId);
    },
    enabled: !!instanceId,
    refetchInterval: 30000,
  });

  const status = statusQuery.data;
  const rules = rulesQuery.data;
  const stats = statsQuery.data;
  const isLoading = statusQuery.isLoading || rulesQuery.isLoading || statsQuery.isLoading;
  const error = statusQuery.error || rulesQuery.error || statsQuery.error;

  if (!instanceId) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-6 py-4 text-sm text-amber-200">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>Please select an EC2 instance from the dropdown above to view gateway status.</span>
        </div>
      </div>
    );
  }

  if (isLoading && !status) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        <span className="ml-3 text-slate-400">Loading gateway status...</span>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-200">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load gateway status. {error instanceof Error ? error.message : 'Please check that the gateway service is running on the selected instance.'}</span>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Gateway Statistics */}
      {stats && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Gateway Statistics</h3>
            <span className="text-xs text-slate-400">
              Last updated: {new Date(stats.lastUpdated).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top IPs */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Top IPs</h4>
              <div className="space-y-2">
                {stats.stats.topIps.length > 0 ? (
                  stats.stats.topIps.slice(0, 5).map((item) => (
                    <div
                      key={item.ip}
                      className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-sm"
                    >
                      <span className="font-mono text-slate-300">{item.ip}</span>
                      <span className="text-slate-400">{item.requests} requests</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No IP data available</p>
                )}
              </div>
            </div>

            {/* Top Countries */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Top Countries</h4>
              <div className="space-y-2">
                {stats.stats.topCountries.length > 0 ? (
                  stats.stats.topCountries.slice(0, 5).map((item) => (
                    <div
                      key={item.country}
                      className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-sm"
                    >
                      <span className="text-slate-300">{item.country}</span>
                      <span className="text-slate-400">{item.requests} requests</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No country data available</p>
                )}
              </div>
            </div>

            {/* Top ASNs */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Top ASNs</h4>
              <div className="space-y-2">
                {stats.stats.topAsns.length > 0 ? (
                  stats.stats.topAsns.slice(0, 5).map((item) => (
                    <div
                      key={item.asn}
                      className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-sm"
                    >
                      <span className="font-mono text-slate-300">AS{item.asn}</span>
                      <span className="text-slate-400">{item.requests} requests</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No ASN data available</p>
                )}
              </div>
            </div>

            {/* Top Paths */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Top Paths</h4>
              <div className="space-y-2">
                {stats.stats.topPaths.length > 0 ? (
                  stats.stats.topPaths.slice(0, 5).map((item) => (
                    <div
                      key={item.path}
                      className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-sm"
                    >
                      <span 
                        className="font-mono text-slate-300 truncate whitespace-nowrap flex-1 min-w-0 mr-2"
                        title={item.path}
                      >
                        {item.path}
                      </span>
                      <span className="text-slate-400 flex-shrink-0">{item.requests} requests</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No path data available</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Total Requests</span>
              <span className="text-lg font-semibold text-white">
                {stats.stats.totalRequests.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Firewall Rules */}
      {rules && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Firewall Rules</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Adaptive Rules */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Adaptive Rules</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked IPs</span>
                  <span className="font-mono text-blue-400">
                    {rules.adaptive?.blockIps?.length || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked CIDRs</span>
                  <span className="font-mono text-blue-400">
                    {rules.adaptive?.blockCidrs?.length || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked ASNs</span>
                  <span className="font-mono text-blue-400">
                    {rules.adaptive?.blockAsns?.length || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Rules */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                {status.ai.enabled && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
                <span>AI-Generated Rules</span>
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked IPs</span>
                  <span className="font-mono text-emerald-400">
                    {rules.ai.blockIps.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked CIDRs</span>
                  <span className="font-mono text-emerald-400">
                    {rules.ai.blockCidrs.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked ASNs</span>
                  <span className="font-mono text-emerald-400">
                    {rules.ai.blockAsns.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Manual Rules (Static) */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Manual Rules</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked IPs</span>
                  <span className="font-mono text-white">
                    {rules.static.blockIps?.length || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked CIDRs</span>
                  <span className="font-mono text-white">
                    {rules.static.blockCidrs?.length || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <span className="text-slate-400">Blocked ASNs</span>
                  <span className="font-mono text-white">
                    {rules.static.blockAsns?.length || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

