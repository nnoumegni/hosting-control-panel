"use client";

import type { FirewallSettings } from '@hosting/common';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../../../lib/api';
import { CreateFirewallRuleModal } from './_components/create-firewall-rule-modal';
import { QuickFirewallRulePanel } from './_components/quick-firewall-rule-panel';
import { AwsRulesTab } from './_components/aws-rules-tab';
import { DDoSProtectionPanel } from './_components/ddos-protection-panel';

export default function FirewallPage() {
  const [firewallSettings, setFirewallSettings] = useState<FirewallSettings | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  // Get selected instance ID from localStorage (set by EC2 dropdown)
  const getSelectedInstanceId = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const instanceId = localStorage.getItem('hosting-control-panel:selected-ec2-instance');
      if (instanceId && instanceId.trim().length > 0 && instanceId.startsWith('i-')) {
        return instanceId.trim();
      }
      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const instanceId = getSelectedInstanceId();
    setSelectedInstanceId(instanceId);
    
    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setSelectedInstanceId(newInstanceId);
    };
    
    window.addEventListener('storage', handleInstanceChange);
    window.addEventListener('ec2-instance-selected', handleInstanceChange);
    
    return () => {
      window.removeEventListener('storage', handleInstanceChange);
      window.removeEventListener('ec2-instance-selected', handleInstanceChange);
    };
  }, []);

  const loadFirewallSettings = useCallback(async () => {
    try {
      const settings = await apiFetch<FirewallSettings>('firewall/settings');
      setFirewallSettings(settings);
    } catch (err) {
      // Silently fail - settings are optional for display
      console.warn('Failed to load firewall settings', err);
    }
  }, []);

  useEffect(() => {
    loadFirewallSettings();
  }, [loadFirewallSettings]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Firewall Manager</h1>
        <div className="flex items-center gap-4">
          {firewallSettings && (firewallSettings.securityGroupId || firewallSettings.networkAclId) && (
            <div className="flex items-center gap-4 text-xs text-slate-400">
              {firewallSettings.securityGroupId && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">SG:</span>
                  <span className="font-mono text-slate-300">{firewallSettings.securityGroupId}</span>
                </div>
              )}
              {firewallSettings.networkAclId && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">NACL:</span>
                  <span className="font-mono text-slate-300">{firewallSettings.networkAclId}</span>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => {
              const win =
                typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
                  ? ((globalThis as Record<string, unknown>).window as Window & { dispatchEvent?: (event: Event) => boolean })
                  : null;
              if (win) {
                win.dispatchEvent?.(new CustomEvent('firewall-rules-updated'));
              }
            }}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 text-sm transition"
            title="Refresh firewall rules from AWS"
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <QuickFirewallRulePanel />

          {/* DDoS Protection */}
          <DDoSProtectionPanel
            instanceId={selectedInstanceId ?? undefined}
            securityGroupId={firewallSettings?.securityGroupId ?? undefined}
          />
        </div>

        {/* Security Rules Table */}
        <section className="col-span-1 lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <AwsRulesTab />
        </section>
      </div>
      <CreateFirewallRuleModal />
    </div>
  );
}

