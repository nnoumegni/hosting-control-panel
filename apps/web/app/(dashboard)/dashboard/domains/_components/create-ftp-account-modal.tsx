"use client";

import { useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

interface CreateFtpAccountModalProps {
  domain: string;
  onClose: () => void;
  onCreate: (account: {
    localUsername: string;
    password: string;
    homeDirectory?: string;
    uploadBandwidth?: number;
    downloadBandwidth?: number;
    maxConnections?: number;
    chroot?: boolean;
  }) => Promise<void>;
}

export function CreateFtpAccountModal({ domain, onClose, onCreate }: CreateFtpAccountModalProps) {
  const [localUsername, setLocalUsername] = useState('');
  const [password, setPassword] = useState('');
  const [homeDirectory, setHomeDirectory] = useState('');
  const [uploadBandwidth, setUploadBandwidth] = useState('');
  const [downloadBandwidth, setDownloadBandwidth] = useState('');
  const [maxConnections, setMaxConnections] = useState('');
  const [chroot, setChroot] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!localUsername.trim()) {
      setError('Username is required');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    // Basic validation
    if (localUsername.includes('@')) {
      setError('Username should not include @ symbol. It will be automatically added with the domain.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate({
        localUsername: localUsername.trim(),
        password,
        homeDirectory: homeDirectory.trim() || undefined,
        uploadBandwidth: uploadBandwidth ? parseInt(uploadBandwidth, 10) : undefined,
        downloadBandwidth: downloadBandwidth ? parseInt(downloadBandwidth, 10) : undefined,
        maxConnections: maxConnections ? parseInt(maxConnections, 10) : undefined,
        chroot,
      });
      setLocalUsername('');
      setPassword('');
      setHomeDirectory('');
      setUploadBandwidth('');
      setDownloadBandwidth('');
      setMaxConnections('');
      setChroot(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create FTP account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setLocalUsername('');
      setPassword('');
      setHomeDirectory('');
      setUploadBandwidth('');
      setDownloadBandwidth('');
      setMaxConnections('');
      setChroot(true);
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Create FTP Account</h2>
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
            <label htmlFor="localUsername" className="block text-sm font-medium text-slate-300 mb-2">
              Username <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="localUsername"
                type="text"
                value={localUsername}
                onChange={(e) => setLocalUsername(e.target.value)}
                placeholder="admin"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                required
              />
              <span className="text-slate-400">@{domain}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Full username will be: <code className="text-slate-400">{localUsername || 'username'}@{domain}</code>
            </p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              required
            />
          </div>

          <div>
            <label htmlFor="homeDirectory" className="block text-sm font-medium text-slate-300 mb-2">
              Home Directory (optional)
            </label>
            <input
              id="homeDirectory"
              type="text"
              value={homeDirectory}
              onChange={(e) => setHomeDirectory(e.target.value)}
              placeholder={`/var/www/${domain}`}
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-500">Default: Domain document root</p>
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

          <div>
            <label htmlFor="maxConnections" className="block text-sm font-medium text-slate-300 mb-2">
              Max Connections (optional)
            </label>
            <input
              id="maxConnections"
              type="number"
              value={maxConnections}
              onChange={(e) => setMaxConnections(e.target.value)}
              placeholder="Unlimited"
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              min="1"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="chroot"
              type="checkbox"
              checked={chroot}
              onChange={(e) => setChroot(e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-slate-900 disabled:opacity-50"
            />
            <label htmlFor="chroot" className="text-sm text-slate-300">
              Restrict to home directory (chroot)
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
              disabled={isSubmitting || !localUsername.trim() || !password.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

