"use client";

import { useState } from 'react';
import { X, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface FtpAccount {
  username: string;
  localUsername: string;
  domain: string;
  homeDirectory: string;
  enabled: boolean;
}

interface TestFtpAccountModalProps {
  account: FtpAccount;
  onClose: () => void;
  onTest: (password: string) => Promise<{ success: boolean; message: string }>;
}

export function TestFtpAccountModal({ account, onClose, onTest }: TestFtpAccountModalProps) {
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTestResult(null);

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setIsTesting(true);
    try {
      const result = await onTest(password);
      setTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test FTP account');
    } finally {
      setIsTesting(false);
    }
  };

  const handleClose = () => {
    if (!isTesting) {
      setPassword('');
      setError(null);
      setTestResult(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Test FTP Connection</h2>
          <button
            onClick={handleClose}
            disabled={isTesting}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
            <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 font-mono text-sm">
              {account.username}
            </div>
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
              disabled={isTesting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {testResult && (
            <div
              className={`rounded-lg p-3 flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    testResult.success ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                </p>
                <p
                  className={`text-xs mt-1 ${
                    testResult.success ? 'text-emerald-300/70' : 'text-red-300/70'
                  }`}
                >
                  {testResult.message}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isTesting}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              {testResult ? 'Close' : 'Cancel'}
            </button>
            {!testResult && (
              <button
                type="submit"
                disabled={isTesting || !password.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isTesting && <Loader2 className="h-4 w-4 animate-spin" />}
                Test Connection
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

