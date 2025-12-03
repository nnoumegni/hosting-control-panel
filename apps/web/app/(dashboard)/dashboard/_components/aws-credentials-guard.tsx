"use client";

import type { ServerSettings } from '@hosting/common';
import { useEffect, useState } from 'react';

import { apiFetch } from '../../../../lib/api';
import { ServerSettingsModal } from '../../../../components/server-settings-modal';

interface AwsCredentialsGuardProps {
  children: React.ReactNode;
}

export function AwsCredentialsGuard({ children }: AwsCredentialsGuardProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [isServerSettingsOpen, setServerSettingsOpen] = useState(false);

  const checkCredentials = async () => {
    setIsChecking(true);
    setError(null);

    try {
      const serverSettings = await apiFetch<ServerSettings>('settings/server');
      setSettings(serverSettings);

      // Check if AWS credentials are configured
      const hasCredentials =
        serverSettings.awsAccessKeyId &&
        serverSettings.hasAwsSecretAccessKey &&
        serverSettings.awsRegion;

      if (!hasCredentials) {
        setIsValid(false);
        setError('AWS credentials are not configured. Please configure AWS Access Key ID, Secret Access Key, and Region in server settings.');
      } else {
        setIsValid(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check AWS credentials';
      setError(message);
      setIsValid(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkCredentials();

    // Listen for server settings updates
    const win =
      typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
        ? ((globalThis as Record<string, unknown>).window as Window & {
            addEventListener?: (type: string, listener: (event: Event) => void) => void;
            removeEventListener?: (type: string, listener: (event: Event) => void) => void;
          })
        : null;

    if (!win) {
      return;
    }

    const handleOpenSettings = () => {
      setServerSettingsOpen(true);
    };

    const handleSettingsSaved = () => {
      checkCredentials();
    };

    win.addEventListener?.('open-server-settings', handleOpenSettings);
    win.addEventListener?.('server-settings-saved', handleSettingsSaved);

    return () => {
      win.removeEventListener?.('open-server-settings', handleOpenSettings);
      win.removeEventListener?.('server-settings-saved', handleSettingsSaved);
    };
  }, []);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-brand"></div>
          <p className="text-sm text-slate-400">Checking AWS credentials...</p>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-rose-500/40 bg-rose-500/10 p-8">
            <div className="mb-6 flex items-center gap-3">
              <svg
                className="h-6 w-6 text-rose-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h1 className="text-2xl font-semibold text-rose-200">AWS Credentials Required</h1>
            </div>

            <div className="mb-6 space-y-4 text-sm text-slate-300">
              <p className="text-base text-rose-200">{error}</p>
              <p className="text-slate-400">
                The dashboard requires AWS credentials to manage firewall rules and infrastructure. Please configure the following in server settings:
              </p>
              <ul className="ml-6 list-disc space-y-2 text-slate-400">
                <li>AWS Access Key ID</li>
                <li>AWS Secret Access Key</li>
                <li>AWS Region</li>
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setServerSettingsOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90"
              >
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
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Open Server Settings
              </button>
              <button
                onClick={checkCredentials}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500"
              >
                Check Again
              </button>
            </div>
          </div>
        </div>
        <ServerSettingsModal
          isOpen={isServerSettingsOpen}
          onClose={() => setServerSettingsOpen(false)}
          initialSettings={settings}
          onSaved={(updatedSettings) => {
            setSettings(updatedSettings);
            checkCredentials();
          }}
        />
      </>
    );
  }

  return (
    <>
      {children}
      <ServerSettingsModal
        isOpen={isServerSettingsOpen}
        onClose={() => setServerSettingsOpen(false)}
        initialSettings={settings}
        onSaved={(updatedSettings) => {
          setSettings(updatedSettings);
          checkCredentials();
        }}
      />
    </>
  );
}

