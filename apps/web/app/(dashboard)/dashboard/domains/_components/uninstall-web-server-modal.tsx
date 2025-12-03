"use client";

import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface UninstallWebServerModalProps {
  type: 'nginx' | 'apache';
  onClose: () => void;
  onConfirm: () => void;
  isUninstalling?: boolean;
}

export function UninstallWebServerModal({ type, onClose, onConfirm, isUninstalling = false }: UninstallWebServerModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const isConfirmed = confirmText.toLowerCase().trim() === 'uninstall';

  const handleConfirm = () => {
    if (isConfirmed) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-xl border border-rose-500/50 shadow-xl relative animate-in fade-in-0 zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-rose-500/20 p-2">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">Uninstall {type === 'nginx' ? 'Nginx' : 'Apache'}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isUninstalling}
            className="text-slate-400 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
            <p className="text-sm font-medium text-rose-200 mb-2">⚠️ Warning: This action cannot be undone</p>
            <p className="text-sm text-rose-300/90 leading-relaxed">
              Uninstalling {type === 'nginx' ? 'Nginx' : 'Apache'} will permanently delete:
            </p>
            <ul className="mt-3 space-y-1 text-sm text-rose-300/90 list-disc list-inside">
              <li>All web server configuration files</li>
              <li>All hosted domains and their configurations</li>
              <li>All website files in the web root directory</li>
              <li>All SSL certificates associated with domains</li>
              <li>All virtual host configurations</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Type <span className="font-mono text-rose-400">uninstall</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isUninstalling}
              placeholder="uninstall"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
            {confirmText && !isConfirmed && (
              <p className="mt-1 text-xs text-rose-400">Text must match exactly: "uninstall"</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={isUninstalling}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmed || isUninstalling}
            className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-rose-600 flex items-center gap-2"
          >
            {isUninstalling && <Loader2 className="h-4 w-4 animate-spin" />}
            Uninstall
          </button>
        </div>
      </div>
    </div>
  );
}

