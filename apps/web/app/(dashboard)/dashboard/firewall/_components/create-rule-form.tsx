"use client";

import type { FirewallRule } from '@hosting/common';
import { FormEvent, useState } from 'react';

import { apiFetch } from '../../../../../lib/api';

const protocolOptions: Array<FirewallRule['protocol']> = ['tcp', 'udp', 'icmp', 'all'];
const directionOptions: Array<FirewallRule['direction']> = ['ingress', 'egress'];
const actionOptions: Array<FirewallRule['action']> = ['allow', 'deny'];

interface FormMessage {
  type: 'success' | 'error';
  text: string;
}

export function CreateFirewallRuleForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);

  const resetForm = (form: HTMLFormElement) => {
    (form as any).reset?.();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const form = event.currentTarget;
    const formData = new ((globalThis as any).FormData)(form);

    const name = String(formData.get('name') ?? '').trim();
    const direction = (formData.get('direction') ?? 'ingress') as FirewallRule['direction'];
    const protocol = (formData.get('protocol') ?? 'tcp') as FirewallRule['protocol'];
    const action = (formData.get('action') ?? 'allow') as FirewallRule['action'];
    const description = String(formData.get('description') ?? '').trim();
    const portFromRaw = String(formData.get('portFrom') ?? '').trim();
    const portToRaw = String(formData.get('portTo') ?? '').trim();
    const sourceRaw = String(formData.get('source') ?? '').trim();
    const destinationRaw = String(formData.get('destination') ?? '').trim();
    const status = (formData.get('status') ?? 'enabled') as FirewallRule['status'];

    if (!name) {
      setMessage({ type: 'error', text: 'Rule name is required.' });
      return;
    }

    let portRange: FirewallRule['portRange'] | null = null;

    if (portFromRaw || portToRaw) {
      const portFrom = Number(portFromRaw || portToRaw);
      const portTo = Number(portToRaw || portFromRaw);

      if (Number.isNaN(portFrom) || Number.isNaN(portTo)) {
        setMessage({ type: 'error', text: 'Port range must be numeric.' });
        return;
      }

      if (portFrom < 0 || portFrom > 65535 || portTo < 0 || portTo > 65535 || portTo < portFrom) {
        setMessage({ type: 'error', text: 'Port range is invalid.' });
        return;
      }

      portRange = { from: portFrom, to: portTo };
    }

    const payload = {
      name,
      description: description || undefined,
      direction,
      protocol,
      portRange,
      source: sourceRaw ? sourceRaw : null,
      destination: destinationRaw ? destinationRaw : null,
      action,
      status,
    };

    setIsSubmitting(true);
    try {
      await apiFetch<FirewallRule>('firewall/rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setMessage({
        type: 'success',
        text: 'Firewall rule created successfully. Changes may take a few seconds to propagate.',
      });

      resetForm(form);

      // Dispatch event to refresh rules list
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
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Add firewall rule</h2>
        <p className="text-sm text-slate-400">
          Define ingress or egress policies. Leave source/destination blank to apply to any address.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Rule name</span>
          <input
            type="text"
            name="name"
            required
            placeholder="Allow HTTPS ingress"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Direction</span>
          <select
            name="direction"
            defaultValue="ingress"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          >
            {directionOptions.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Action</span>
          <select
            name="action"
            defaultValue="allow"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          >
            {actionOptions.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Protocol</span>
          <select
            name="protocol"
            defaultValue="tcp"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          >
            {protocolOptions.map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Status</span>
          <select
            name="status"
            defaultValue="enabled"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm text-slate-300">
        <span className="font-medium text-slate-200">Description</span>
        <textarea
          name="description"
          rows={2}
          placeholder="Allow public HTTPS traffic to the control panel."
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Source (CIDR or security group)</span>
          <input
            type="text"
            name="source"
            placeholder="0.0.0.0/0"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Destination (CIDR or security group)</span>
          <input
            type="text"
            name="destination"
            placeholder="internal-subnet"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Port from</span>
          <input
            type="number"
            name="portFrom"
            min={0}
            max={65535}
            placeholder="443"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Port to</span>
          <input
            type="number"
            name="portTo"
            min={0}
            max={65535}
            placeholder="443"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
          />
        </label>
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Create rule'}
        </button>
        <span className="text-xs text-slate-500">
          Rules sync to managed firewalls via background automation.
        </span>
      </div>
    </form>
  );
}

