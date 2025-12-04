"use client";

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, Edit2, TestTube, Server, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';
import { CreateFtpAccountModal } from './create-ftp-account-modal';
import { EditFtpAccountModal } from './edit-ftp-account-modal';
import { DeleteConfirmationModal } from './delete-confirmation-modal';
import { TestFtpAccountModal } from './test-ftp-account-modal';

interface FtpServerStatus {
  serverType: 'vsftpd' | 'none';
  installed: boolean;
  running: boolean;
  version?: string;
  port?: number;
  passivePorts?: {
    min: number;
    max: number;
  };
  configPath?: string;
}

interface FtpAccount {
  username: string;
  localUsername: string;
  domain: string;
  homeDirectory: string;
  enabled: boolean;
  serverType: 'vsftpd';
  createdAt?: string;
  lastLogin?: string;
}

interface FtpAccountListResponse {
  accounts: FtpAccount[];
  domain: string;
  serverType: 'vsftpd';
  serverInstalled: boolean;
  serverRunning: boolean;
}

interface FtpAccountsPanelProps {
  domain: string;
  instanceId: string;
}

export function FtpAccountsPanel({ domain, instanceId }: FtpAccountsPanelProps) {
  const [serverStatus, setServerStatus] = useState<FtpServerStatus | null>(null);
  const [accounts, setAccounts] = useState<FtpAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingServer, setIsLoadingServer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FtpAccount | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<string>('');
  const [isStatusPopupOpen, setIsStatusPopupOpen] = useState(false);

  const loadServerStatus = useCallback(async () => {
    try {
      setIsLoadingServer(true);
      setServerError(null);
      const status = await apiFetch<FtpServerStatus>(
        `domains/ftp/server/status?instanceId=${encodeURIComponent(instanceId)}`
      );
      setServerStatus(status);
    } catch (err: any) {
      setServerError(err?.message || 'Failed to load FTP server status');
      setServerStatus({ serverType: 'none', installed: false, running: false });
    } finally {
      setIsLoadingServer(false);
    }
  }, [instanceId]);

  const loadAccounts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiFetch<FtpAccountListResponse>(
        `domains/ftp/accounts?domain=${encodeURIComponent(domain)}&instanceId=${encodeURIComponent(instanceId)}`
      );
      setAccounts(response.accounts || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load FTP accounts');
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, [domain, instanceId]);

  useEffect(() => {
    void loadServerStatus();
    void loadAccounts();
  }, [loadServerStatus, loadAccounts]);

  const handleCreateAccount = async (account: {
    localUsername: string;
    password: string;
    homeDirectory?: string;
    uploadBandwidth?: number;
    downloadBandwidth?: number;
    maxConnections?: number;
    chroot?: boolean;
  }) => {
    try {
      await apiFetch(`domains/ftp/accounts?instanceId=${encodeURIComponent(instanceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...account,
          domain,
        }),
      });
      setIsCreateModalOpen(false);
      void loadAccounts();
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to create FTP account');
    }
  };

  const handleUpdateAccount = async (updates: {
    password?: string;
    homeDirectory?: string;
    enabled?: boolean;
    uploadBandwidth?: number;
    downloadBandwidth?: number;
  }) => {
    if (!selectedAccount) return;
    try {
      await apiFetch(
        `domains/ftp/accounts/${encodeURIComponent(selectedAccount.username)}?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      );
      setIsEditModalOpen(false);
      setSelectedAccount(null);
      void loadAccounts();
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to update FTP account');
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;
    try {
      await apiFetch(
        `domains/ftp/accounts/${encodeURIComponent(selectedAccount.username)}?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'DELETE',
        }
      );
      setIsDeleteModalOpen(false);
      setSelectedAccount(null);
      void loadAccounts();
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to delete FTP account');
    }
  };

  const handleTestAccount = async (password: string): Promise<{ success: boolean; message: string }> => {
    if (!selectedAccount) {
      return { success: false, message: 'No account selected' };
    }
    try {
      const result = await apiFetch<{ success: boolean; message: string }>(
        `domains/ftp/accounts/${encodeURIComponent(selectedAccount.username)}/test?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        }
      );
      return result;
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to test FTP account');
    }
  };

  const handleInstallServer = async (config: {
    port?: number;
    configureFirewall?: boolean;
    enableTLS?: boolean;
    passivePorts?: { min: number; max: number };
  }) => {
    try {
      setIsInstalling(true);
      setInstallProgress('Sending installation command...');
      const result = await apiFetch<{ commandId: string; status: string }>(
        `domains/ftp/server/install?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        }
      );
      void pollInstallationStatus(result.commandId);
    } catch (err: any) {
      setServerError(err?.message || 'Failed to install FTP server');
      setIsInstalling(false);
      setInstallProgress('');
    }
  };

  const pollInstallationStatus = async (commandId: string) => {
    const poll = async () => {
      try {
        const status = await apiFetch<{ status: string; output?: string; error?: string }>(
          `domains/ftp/server/installation/${commandId}?instanceId=${encodeURIComponent(instanceId)}`
        );

        if (status.status === 'Success') {
          setInstallProgress('Installation completed successfully!');
          setIsInstalling(false);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          void loadServerStatus();
        } else if (status.status === 'Failed') {
          setServerError(status.error || 'FTP server installation failed');
          setIsInstalling(false);
          setInstallProgress('');
        } else {
          const lastLine = status.output?.split('\n').filter((l) => l.trim()).pop() ?? '';
          setInstallProgress(lastLine || 'Installing FTP server...');
          setTimeout(poll, 3000);
        }
      } catch (err) {
        console.error('Failed to check installation status', err);
        setInstallProgress('Checking installation status...');
        setTimeout(poll, 3000);
      }
    };
    void poll();
  };

  return (
    <div className="space-y-6">
      {/* FTP Accounts */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">FTP Accounts</h3>
            <button
              onClick={() => {
                void loadServerStatus();
                setIsStatusPopupOpen(true);
              }}
              className="p-1 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded transition"
              title="View FTP server status"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadAccounts()}
              disabled={isLoading}
              className="text-sm text-slate-400 hover:text-slate-300 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Refresh'
              )}
            </button>
            {serverStatus?.installed && serverStatus?.running && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition"
              >
                <Plus className="h-4 w-4" />
                Add Account
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p>Loading FTP accounts...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="mb-2">No FTP accounts found for this website.</p>
            {serverStatus?.installed && serverStatus?.running && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="text-emerald-400 hover:text-emerald-300 text-sm"
              >
                Create your first FTP account
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-400 font-semibold">Username</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-semibold">Home Directory</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-semibold">Status</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-semibold">Last Login</th>
                  <th className="px-4 py-2 text-right text-slate-400 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {accounts.map((account) => (
                  <tr key={account.username} className="hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-slate-200 font-mono text-xs">{account.username}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{account.homeDirectory}</td>
                    <td className="px-4 py-3">
                      {account.enabled ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                          Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-500/40 bg-slate-500/10 px-2 py-1 text-xs font-semibold text-slate-300">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {account.lastLogin ? new Date(account.lastLogin).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setIsTestModalOpen(true);
                          }}
                          className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                          title="Test connection"
                        >
                          <TestTube className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          title="Edit account"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete account"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateFtpAccountModal
          domain={domain}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateAccount}
        />
      )}

      {isEditModalOpen && selectedAccount && (
        <EditFtpAccountModal
          account={selectedAccount}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedAccount(null);
          }}
          onUpdate={handleUpdateAccount}
        />
      )}

      {isDeleteModalOpen && selectedAccount && (
        <DeleteConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedAccount(null);
          }}
          onConfirm={handleDeleteAccount}
          title="Delete FTP Account"
          message={`Are you sure you want to delete the FTP account "${selectedAccount.username}"? This action cannot be undone.`}
          confirmText="Delete Account"
          itemName={selectedAccount.username}
        />
      )}

      {isTestModalOpen && selectedAccount && (
        <TestFtpAccountModal
          account={selectedAccount}
          onClose={() => {
            setIsTestModalOpen(false);
            setSelectedAccount(null);
          }}
          onTest={handleTestAccount}
        />
      )}

      {/* FTP Server Status Popup */}
      {isStatusPopupOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsStatusPopupOpen(false)}>
          <div
            className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-white">FTP Server Status</h3>
              </div>
              <button
                onClick={() => setIsStatusPopupOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {serverError && (
              <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {serverError}
              </div>
            )}

            {isLoadingServer ? (
              <div className="text-center py-8 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p>Loading server status...</p>
              </div>
            ) : serverStatus ? (
              <div className="space-y-4">
                {serverStatus.installed ? (
                  <>
                    <div className="flex items-center justify-between py-2 border-b border-slate-800">
                      <span className="text-sm text-slate-400">Status:</span>
                      <div className="flex items-center gap-2">
                        {serverStatus.running ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            <span className="text-sm text-emerald-400 font-medium">Running</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-rose-400" />
                            <span className="text-sm text-rose-400 font-medium">Stopped</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-800">
                      <span className="text-sm text-slate-400">Server:</span>
                      <span className="text-sm text-slate-200">
                        {serverStatus.serverType} {serverStatus.version ? `v${serverStatus.version}` : ''}
                      </span>
                    </div>
                    {serverStatus.port && (
                      <div className="flex items-center justify-between py-2 border-b border-slate-800">
                        <span className="text-sm text-slate-400">Port:</span>
                        <span className="text-sm text-slate-200">{serverStatus.port}</span>
                      </div>
                    )}
                    {serverStatus.passivePorts && (
                      <div className="flex items-center justify-between py-2 border-b border-slate-800">
                        <span className="text-sm text-slate-400">Passive Ports:</span>
                        <span className="text-sm text-slate-200">
                          {serverStatus.passivePorts.min}-{serverStatus.passivePorts.max}
                        </span>
                      </div>
                    )}
                    {serverStatus.configPath && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-slate-400">Config:</span>
                        <span className="text-sm text-slate-200 font-mono text-xs">{serverStatus.configPath}</span>
                      </div>
                    )}
                    <div className="pt-4 flex gap-2">
                      <button
                        onClick={() => void loadServerStatus()}
                        disabled={isLoadingServer}
                        className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isLoadingServer ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Server className="h-4 w-4" />
                            Refresh
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-amber-300 py-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">FTP server is not installed</span>
                    </div>
                    {isInstalling ? (
                      <div className="flex items-start gap-2 text-sm text-amber-300/90 py-2">
                        <Loader2 className="h-4 w-4 animate-spin mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">Installing...</p>
                          {installProgress && (
                            <p className="text-xs text-amber-400/70 mt-1 truncate" title={installProgress}>
                              {installProgress}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleInstallServer({ configureFirewall: true, enableTLS: true })}
                        className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition"
                      >
                        Install vsftpd
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

