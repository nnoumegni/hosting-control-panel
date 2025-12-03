"use client";

import type { FirewallRule } from '@hosting/common';
import { useState } from 'react';

import { apiFetch } from '../../../../../lib/api';

type QuickAction = 'block' | 'allow';

interface FormMessage {
  type: 'success' | 'error';
  text: string;
}

const actionToRule: Record<QuickAction, Pick<FirewallRule, 'action' | 'direction' | 'protocol'>> = {
  block: { action: 'deny', direction: 'ingress', protocol: 'all' },
  allow: { action: 'allow', direction: 'ingress', protocol: 'all' },
};

export function QuickFirewallRulePanel() {
  const [ipAddress, setIpAddress] = useState('');
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleAction = async (action: QuickAction) => {
    setMessage(null);

    const trimmed = ipAddress.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Enter an IPv4 or IPv6 address (CIDR allowed).' });
      return;
    }

    setIsPending(true);
    try {
      const ruleInput = actionToRule[action];
      await apiFetch<FirewallRule>('firewall/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: `${action === 'block' ? 'Block' : 'Allow'} ${trimmed}`,
          ...ruleInput,
          source: trimmed,
          portRange: null,
          status: 'enabled',
        }),
      });
      setMessage({
        type: 'success',
        text: `${action === 'block' ? 'Blocked' : 'Allowed'} ${trimmed}. Rule applied to AWS.`,
      });
      setIpAddress('');
      // Dispatch event to refresh AWS rules
      const win =
        typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
          ? ((globalThis as Record<string, unknown>).window as Window & { dispatchEvent?: (event: Event) => boolean })
          : null;
      if (win) {
        win.dispatchEvent?.(new CustomEvent('firewall-rules-updated'));
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to create firewall rule.';
      setMessage({ type: 'error', text });
    } finally {
      setIsPending(false);
    }
  };


  return (
    <section className="col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
      <h2 className="text-xl font-semibold">Quick Actions</h2>
      <p className="text-slate-400 text-sm">
        Instantly block or allow a specific IP address. Use advanced options for ports, descriptions, and CIDR ranges.
      </p>

      <div>
        <label htmlFor="ip" className="block text-sm font-medium text-slate-300 mb-1">
          IP Address or CIDR
        </label>
        <input
          id="ip"
          type="text"
          value={ipAddress}
          onChange={(event) => setIpAddress((event.currentTarget as any).value as string)}
          placeholder="203.0.113.42 or 2001:db8::/64"
          className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // Default to block on Enter key
              void handleAction('block');
            }
          }}
        />
      </div>

      {message ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleAction('block')}
          disabled={isPending}
          className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-2 rounded-md transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Applying...' : 'Block IP'}
        </button>
        <button
          type="button"
          onClick={() => handleAction('allow')}
          disabled={isPending}
          className="flex-1 bg-green-600 hover:bg-green-500 text-white font-medium py-2 rounded-md transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Applying...' : 'Allow IP'}
        </button>
        <CreateAdvancedButton />
      </div>
    </section>
  );
}

function CreateAdvancedButton() {
  const [isOpen, setIsOpen] = useState(false);
  const openModal = () => {
    const win = (globalThis as unknown as { window?: any }).window;
    if (!win) {
      return;
    }
    win.dispatchEvent(new CustomEvent('firewall-advanced-modal-toggle', { detail: true }));
  };

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          openModal();
        }}
        className="w-full bg-slate-700 hover:bg-slate-600 py-2 rounded-md text-sm font-medium transition"
      >
        More Options ▾
      </button>
    </div>
  );
}

