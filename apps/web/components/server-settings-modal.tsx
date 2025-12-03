"use client";

import type { ServerSettings } from '@hosting/common';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState, useTransition } from 'react';

import { apiFetch } from '../lib/api';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSettings: ServerSettings | null;
  onSaved: (settings: ServerSettings | null) => void;
}

interface FormMessage {
  type: 'success' | 'error';
  text: string;
}

// Default AWS region
const DEFAULT_AWS_REGION = 'us-east-1';

export function ServerSettingsModal({ isOpen, onClose, initialSettings, onSaved }: ServerSettingsModalProps) {
  const [name, setName] = useState(initialSettings?.name ?? '');
  const [awsRegion, setAwsRegion] = useState(initialSettings?.awsRegion ?? DEFAULT_AWS_REGION);
  const [awsAccessKeyId, setAwsAccessKeyId] = useState(initialSettings?.awsAccessKeyId ?? '');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');
  const [clearSecret, setClearSecret] = useState(false);
  const [hasStoredSecret, setHasStoredSecret] = useState(initialSettings?.hasAwsSecretAccessKey ?? false);
  const [updatedAt, setUpdatedAt] = useState(initialSettings?.updatedAt ?? null);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setName(initialSettings?.name ?? '');
    // Use defaults if initial settings are missing or empty
    setAwsRegion(initialSettings?.awsRegion || DEFAULT_AWS_REGION);
    setAwsAccessKeyId(initialSettings?.awsAccessKeyId || '');
    // Never set default secret - user must provide it
    setAwsSecretAccessKey('');
    setClearSecret(false);
    setHasStoredSecret(initialSettings?.hasAwsSecretAccessKey ?? false);
    setUpdatedAt(initialSettings?.updatedAt ?? null);
    setMessage(null);
  }, [initialSettings, isOpen]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const trimmedName = name.trim();
    const trimmedRegion = awsRegion.trim();
    const trimmedAccessKey = awsAccessKeyId.trim();
    const trimmedSecret = awsSecretAccessKey.trim();

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          name: trimmedName || null,
          awsRegion: trimmedRegion || null,
          awsAccessKeyId: trimmedAccessKey || null,
        };

        if (trimmedSecret) {
          payload.awsSecretAccessKey = trimmedSecret;
        } else if (clearSecret) {
          payload.clearAwsSecretAccessKey = true;
        }

        const result = await apiFetch<ServerSettings>('settings/server', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        setHasStoredSecret(result.hasAwsSecretAccessKey);
        setAwsSecretAccessKey('');
        setClearSecret(false);
        setUpdatedAt(result.updatedAt);
            setMessage({ type: 'success', text: 'AWS settings updated successfully.' });
            
            // Dispatch event to notify other components
            const win =
              typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
                ? ((globalThis as Record<string, unknown>).window as Window & { dispatchEvent?: (event: Event) => boolean })
                : null;
            if (win) {
              win.dispatchEvent?.(new CustomEvent('server-settings-saved'));
            }
            
            // Only close modal after a short delay to show success message
            setTimeout(() => {
              onSaved(result);
              onClose();
            }, 500);
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Failed to update server settings.';
        setMessage({ type: 'error', text });
      }
    });
  };

  const handleClearSecretToggle = (next: boolean) => {
    setClearSecret(next);
    if (next) {
      setAwsSecretAccessKey('');
      setHasStoredSecret(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-xl transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                  AWS Settings
                </Dialog.Title>
                <p className="mt-1 text-sm text-slate-400">
                  Configure AWS region and account credentials. Values are encrypted at rest using the generated
                  passphrase.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div className="grid gap-4">
                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      <span className="font-medium text-slate-200">Server name</span>
                      <input
                        value={name}
                        onChange={(event) => setName((event.currentTarget as any).value as string)}
                        placeholder="Production Cluster"
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      <span className="font-medium text-slate-200">AWS region</span>
                      <input
                        value={awsRegion}
                        onChange={(event) => setAwsRegion((event.currentTarget as any).value as string)}
                        placeholder="us-east-1"
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
                      />
                      <span className="text-xs text-slate-500">
                        AWS region for EC2 resources (e.g., us-east-1, eu-west-1)
                      </span>
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      <span className="font-medium text-slate-200">AWS access key ID</span>
                      <input
                        value={awsAccessKeyId}
                        onChange={(event) => setAwsAccessKeyId((event.currentTarget as any).value as string)}
                        placeholder="AKIA..."
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-slate-300">
                      <span className="font-medium text-slate-200">AWS secret access key</span>
                      <input
                        type="password"
                        value={awsSecretAccessKey}
                        onChange={(event) => {
                          const value = (event.currentTarget as any).value as string;
                          setAwsSecretAccessKey(value);
                          if (clearSecret && value) {
                            setClearSecret(false);
                          }
                        }}
                        placeholder="••••••••"
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-brand focus:outline-none"
                      />
                      <span className="text-xs text-slate-500">
                        Leave blank to keep the stored secret. Provide a new secret to rotate credentials.
                      </span>
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        <input
                          type="checkbox"
                          checked={clearSecret}
                          onChange={(event) => handleClearSecretToggle((event.currentTarget as any).checked as boolean)}
                        />
                        Clear stored secret on save
                      </label>
                    </label>
                  </div>

                  <p className="text-xs text-slate-500">
                    Credential status:{' '}
                    <span className="font-medium text-slate-200">
                      {hasStoredSecret ? 'Secret configured' : 'Secret not configured'}
                    </span>
                  </p>

                  {updatedAt ? (
                    <p className="text-xs text-slate-500">
                      Last updated:{' '}
                      <span className="font-medium text-slate-300">{new Date(updatedAt).toLocaleString()}</span>
                    </p>
                  ) : null}

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

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

