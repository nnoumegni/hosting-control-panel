"use client";

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

interface InstallWebServerModalProps {
  type: 'nginx' | 'apache';
  onClose: () => void;
  onInstall: (config: {
    type: 'nginx' | 'apache';
    httpPort: number;
    httpsPort: number;
    phpVersion?: string;
    extras?: string;
    configureFirewall: boolean;
  }) => void;
  isInstalling?: boolean;
}

export function InstallWebServerModal({ type, onClose, onInstall, isInstalling = false }: InstallWebServerModalProps) {
  const [httpPort, setHttpPort] = useState(80);
  const [httpsPort, setHttpsPort] = useState(443);
  const [phpVersion, setPhpVersion] = useState('');
  const [extras, setExtras] = useState('');
  const [configureFirewall, setConfigureFirewall] = useState(true);

  const handleInstall = () => {
    onInstall({
      type,
      httpPort,
      httpsPort,
      phpVersion: phpVersion || undefined,
      extras: extras.trim() || undefined,
      configureFirewall,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-xl border border-slate-800 shadow-xl relative animate-in fade-in-0 zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">
            Install {type === 'nginx' ? 'Nginx' : 'Apache'}
          </h2>
          <button
            onClick={onClose}
            disabled={isInstalling}
            className="text-slate-400 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* HTTP Port */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">HTTP Port</label>
            <input
              type="number"
              min="1"
              max="65535"
              value={httpPort}
              onChange={(e) => setHttpPort(Number(e.target.value))}
              disabled={isInstalling}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* HTTPS Port */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">HTTPS Port</label>
            <input
              type="number"
              min="1"
              max="65535"
              value={httpsPort}
              onChange={(e) => setHttpsPort(Number(e.target.value))}
              disabled={isInstalling}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* PHP Version */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Install PHP-FPM (optional)
            </label>
            <select
              value={phpVersion}
              onChange={(e) => setPhpVersion(e.target.value)}
              disabled={isInstalling}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">No PHP</option>
              <option value="8.3">PHP 8.3</option>
              <option value="8.2">PHP 8.2</option>
              <option value="8.1">PHP 8.1</option>
              <option value="8.0">PHP 8.0</option>
              <option value="7.4">PHP 7.4</option>
            </select>
          </div>

          {/* Extra Packages */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Extra Packages (optional)
            </label>
            <input
              type="text"
              placeholder="e.g., unzip git curl"
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
              disabled={isInstalling}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-400">Space-separated package names</p>
          </div>

          {/* Firewall */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="configureFirewall"
              checked={configureFirewall}
              onChange={() => setConfigureFirewall(!configureFirewall)}
              disabled={isInstalling}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label htmlFor="configureFirewall" className="text-sm text-slate-300 cursor-pointer">
              Automatically open firewall ports
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={isInstalling}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isInstalling && <Loader2 className="h-4 w-4 animate-spin" />}
            Install
          </button>
        </div>
      </div>
    </div>
  );
}

