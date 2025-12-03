"use client";

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

interface FtpAccount {
  username: string;
  localUsername: string;
  domain: string;
  homeDirectory: string;
  enabled: boolean;
}

interface EditFtpAccountModalProps {
  account: FtpAccount;
  onClose: () => void;
  onUpdate: (updates: {
    password?: string;
    homeDirectory?: string;
    enabled?: boolean;
    uploadBandwidth?: number;
    downloadBandwidth?: number;
  }) => Promise<void>;
}

export function EditFtpAccountModal({ account, onClose, onUpdate }: EditFtpAccountModalProps) {
  const [password, setPassword] = useState('');
  const [homeDirectory, setHomeDirectory] = useState(account.homeDirectory);
  const [enabled, setEnabled] = useState(account.enabled);
  const [uploadBandwidth, setUploadBandwidth] = useState('');
  const [downloadBandwidth, setDownloadBandwidth] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHomeDirectory(account.homeDirectory);
    setEnabled(account.enabled);
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    setIsSubmitting(true);
    try {
      await onUpdate({
        password: password.trim() || undefined,
        homeDirectory: homeDirectory.trim() || undefined,
        enabled,
        uploadBandwidth: uploadBandwidth ? parseInt(uploadBandwidth, 10) : undefined,
        downloadBandwidth: downloadBandwidth ? parseInt(downloadBandwidth, 10) : undefined,
      });
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update FTP account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setPassword('');
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Edit FTP Account</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
            <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 font-mono text-sm">
              {account.username}
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
              New Password (leave empty to keep current)
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="homeDirectory" className="block text-sm font-medium text-slate-300 mb-2">
              Home Directory
            </label>
            <input
              id="homeDirectory"
              type="text"
              value={homeDirectory}
              onChange={(e) => setHomeDirectory(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="uploadBandwidth" className="block text-sm font-medium text-slate-300 mb-2">
                Upload Bandwidth (KB/s, optional)
              </label>
              <input
                id="uploadBandwidth"
                type="number"
                value={uploadBandwidth}
                onChange={(e) => setUploadBandwidth(e.target.value)}
                placeholder="Unlimited"
                disabled={isSubmitting}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                min="0"
              />
            </div>
            <div>
              <label htmlFor="downloadBandwidth" className="block text-sm font-medium text-slate-300 mb-2">
                Download Bandwidth (KB/s, optional)
              </label>
              <input
                id="downloadBandwidth"
                type="number"
                value={downloadBandwidth}
                onChange={(e) => setDownloadBandwidth(e.target.value)}
                placeholder="Unlimited"
                disabled={isSubmitting}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                min="0"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-slate-900 disabled:opacity-50"
            />
            <label htmlFor="enabled" className="text-sm text-slate-300">
              Account enabled
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Update Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

