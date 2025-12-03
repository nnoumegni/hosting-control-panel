"use client";

import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  Shield,
  Database,
  Network,
  CreditCard,
  Mail,
  Globe,
  HardDrive,
  Activity,
  Lock,
} from 'lucide-react';

import type { ServerSettings } from '@hosting/common';
import { apiFetch } from '../../../lib/api';
import { ServerSettingsModal } from '../../../components/server-settings-modal';
import { AuthGuard } from '../../../components/auth-guard';
import { AwsCredentialsGuard } from './_components/aws-credentials-guard';
import { ApiEndpointBanner } from '../../../components/api-endpoint-banner';

const navLinks = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/security', label: 'Security', icon: Shield },
  { href: '/dashboard/databases', label: 'Databases', icon: Database },
  { href: '/dashboard/firewall', label: 'Firewall', icon: Network },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/email', label: 'Email', icon: Mail },
  { href: '/dashboard/domains', label: 'Websites', icon: Globe },
  { href: '/dashboard/ssl', label: 'SSL Certificates', icon: Lock },
  { href: '/dashboard/backups', label: 'Backups', icon: HardDrive },
  { href: '/dashboard/monitoring', label: 'Monitoring', icon: Activity },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [isAwsSettingsOpen, setIsAwsSettingsOpen] = useState(false);
  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(null);

  const loadServerSettings = async () => {
    try {
      const settings = await apiFetch<ServerSettings>('settings/server');
      setServerSettings(settings);
    } catch (error) {
      console.warn('Failed to load server settings', error);
    }
  };

  useEffect(() => {
    void loadServerSettings();
  }, []);

  // Listen for server settings updates
  useEffect(() => {
    const handleSettingsUpdate = () => {
      void loadServerSettings();
    };

    const win = typeof window !== 'undefined' ? window : null;
    if (win) {
      win.addEventListener('server-settings-saved', handleSettingsUpdate);
      return () => {
        win.removeEventListener('server-settings-saved', handleSettingsUpdate);
      };
    }
    return undefined;
  }, []);

  const handleServerSettingsSaved = (settings: ServerSettings | null) => {
    setServerSettings(settings);
  };

  return (
    <AuthGuard>
      <AwsCredentialsGuard>
        <ApiEndpointBanner />
        <div className="flex min-h-screen">
          <aside className="hidden border-r border-slate-800 bg-slate-900/30 lg:flex lg:flex-col lg:w-[260px] lg:fixed lg:top-[var(--top-bar-height,56px)] lg:bottom-0 lg:left-0 lg:z-40">
            <div className="flex flex-col h-full">
              <div className="p-6 pb-0 flex-shrink-0">
                <h2 className="text-lg font-semibold text-white">Control Panel</h2>
              </div>
              <nav className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-2 text-sm text-slate-300 min-h-0">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 transition hover:bg-slate-800/60 hover:text-white"
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="p-6 space-y-2 flex-shrink-0 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAwsSettingsOpen(true)}
                  className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/60 hover:text-white"
                >
                  AWS Settings
                </button>
                <div className="rounded-md border border-slate-800 bg-slate-800/50 p-4 text-xs text-slate-400">
                  AWS Region: <span className="font-medium text-slate-200">{serverSettings?.awsRegion ?? 'us-east-1'}</span>
                </div>
              </div>
            </div>
          </aside>
          <main className="flex-1 lg:ml-[260px] flex flex-col gap-8 p-6 lg:p-10">
            {children}
          </main>
        </div>
      <ServerSettingsModal
        isOpen={isAwsSettingsOpen}
        onClose={() => setIsAwsSettingsOpen(false)}
        initialSettings={serverSettings}
        onSaved={handleServerSettingsSaved}
      />
      </AwsCredentialsGuard>
    </AuthGuard>
  );
}

