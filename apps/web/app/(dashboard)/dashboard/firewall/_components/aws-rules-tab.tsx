"use client";

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../../../../lib/api';
import { SecurityGroupTable } from './security-group-table';
import { NetworkAclTable } from './network-acl-table';

interface AwsSecurityGroupRule {
  protocol: string;
  fromPort?: number;
  toPort?: number;
  ipRanges: string[];
  ipv6Ranges: string[];
  direction: 'ingress' | 'egress';
}

interface AwsNetworkAclRule {
  ruleNumber: number;
  protocol: string;
  ruleAction: 'allow' | 'deny';
  egress: boolean;
  cidrBlock?: string;
  ipv6CidrBlock?: string;
  portRange?: { from?: number; to?: number };
}

interface AwsRulesResponse {
  success: boolean;
  securityGroupRules: AwsSecurityGroupRule[];
  networkAclRules: AwsNetworkAclRule[];
  message?: string;
}


type Tab = 'security-group' | 'network-acl';

export function AwsRulesTab() {
  const [securityGroupRules, setSecurityGroupRules] = useState<AwsSecurityGroupRule[]>([]);
  const [networkAclRules, setNetworkAclRules] = useState<AwsNetworkAclRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingRules, setDeletingRules] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Tab>('security-group');

  const loadAwsRules = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<AwsRulesResponse>('firewall/aws-rules');
      if (response.success) {
        setSecurityGroupRules(response.securityGroupRules);
        setNetworkAclRules(response.networkAclRules);
      } else {
        setError(response.message || 'Failed to load AWS rules');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load AWS rules';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDeleteNetworkAclRule = useCallback(
    async (ruleNumber: number, egress: boolean) => {
      if (!confirm(`Are you sure you want to delete this Network ACL rule (Rule #${ruleNumber}, ${egress ? 'Egress' : 'Ingress'})?`)) {
        return;
      }

      const ruleKey = `${ruleNumber}-${egress}`;
      setDeletingRules((prev) => new Set(prev).add(ruleKey));
      try {
        await apiFetch(`firewall/aws-rules/network-acl/${ruleNumber}?egress=${egress}`, {
          method: 'DELETE',
        });
        // Reload rules after deletion
        await loadAwsRules();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete Network ACL rule';
        alert(`Error: ${message}`);
      } finally {
        setDeletingRules((prev) => {
          const next = new Set(prev);
          next.delete(ruleKey);
          return next;
        });
      }
    },
    [loadAwsRules],
  );

  useEffect(() => {
    loadAwsRules();
  }, [loadAwsRules]);

  // Listen for rule updates from child components (when rules are created)
  useEffect(() => {
    const win =
      typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
        ? ((globalThis as Record<string, unknown>).window as Window & {
            addEventListener?: (type: string, listener: (event: Event) => void) => void;
            removeEventListener?: (type: string, listener: (event: Event) => void) => void;
          })
        : null;
    if (!win) return;

    const handleRuleUpdate = () => {
      // Refresh AWS rules after a short delay to allow AWS to propagate
      setTimeout(() => {
        loadAwsRules();
      }, 2000);
    };

    const listener = handleRuleUpdate as (event: Event) => void;
    win.addEventListener?.('firewall-rules-updated', listener);
    return () => {
      win.removeEventListener?.('firewall-rules-updated', listener);
    };
  }, [loadAwsRules]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-6 py-12 text-center text-sm text-slate-400">
        Loading AWS rules...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
          {error}
        </div>
        <button
          onClick={loadAwsRules}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 mb-4">
        <button
          onClick={() => setActiveTab('security-group')}
          className={`px-4 py-2 text-sm rounded-t-md transition ${
            activeTab === 'security-group'
              ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Security Group Rules
        </button>
        <button
          onClick={() => setActiveTab('network-acl')}
          className={`px-4 py-2 text-sm rounded-t-md transition ${
            activeTab === 'network-acl'
              ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Network ACL Rules
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'security-group' ? (
        <div>
          <SecurityGroupTable data={securityGroupRules} />
        </div>
      ) : (
        <div>
          <NetworkAclTable
            data={networkAclRules}
            onDelete={handleDeleteNetworkAclRule}
            deletingRules={deletingRules}
          />
        </div>
      )}
    </div>
  );
}

