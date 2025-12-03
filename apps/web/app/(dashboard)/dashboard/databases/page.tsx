"use client";

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Eye, Pencil, Trash2, ChevronDown, ChevronUp, EyeOff, Copy, KeyRound } from 'lucide-react';
import type { ServerSettings } from '@hosting/common';
import { apiFetch } from '../../../../lib/api';

interface AwsDatabase {
  id: string;
  engine: string;
  name: string;
  status: string;
  region: string;
  createdAt: string;
  endpoint?: string;
  plan?: string;
  settings?: Record<string, unknown>;
}

export default function DatabasesPage() {
  const [items, setItems] = useState<AwsDatabase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AwsDatabase | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    username: string;
    password: string;
    host: string;
    port: number;
    readReplicaHost?: string;
    readReplicaPort?: number;
    engine: string;
  } | null>(null);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [isPasswordRevealed, setIsPasswordRevealed] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showMoreEngines, setShowMoreEngines] = useState(false);
  const [awsRegion, setAwsRegion] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingDb, setEditingDb] = useState<AwsDatabase | null>(null);

  // Modal form state
  const [formName, setFormName] = useState('');
  const [formEngine, setFormEngine] = useState('mysql');
  const [formRegion, setFormRegion] = useState('us-east-1');
  const [formInstanceSize, setFormInstanceSize] = useState('db.t3.micro');
  const [formStorageSize, setFormStorageSize] = useState(20);
  const [formAutoscaling, setFormAutoscaling] = useState(true);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formBackupRetention, setFormBackupRetention] = useState(7);
  const [formMaintenanceWindow, setFormMaintenanceWindow] = useState('Sun:03:00-Sun:04:00');
  const [formPubliclyAccessible, setFormPubliclyAccessible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Common AWS maintenance window options (matching RDS format)
  const maintenanceWindowOptions = [
    'Sun:03:00-Sun:04:00',
    'Sun:05:00-Sun:06:00',
    'Mon:01:00-Mon:02:00',
    'Mon:03:00-Mon:04:00',
    'Tue:01:00-Tue:02:00',
    'Wed:03:00-Wed:04:00',
    'Thu:01:00-Thu:02:00',
    'Fri:23:00-Fri:23:59',
    'Sat:03:00-Sat:04:00',
  ];

  const loadDatabases = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ items: AwsDatabase[] }>('databases');
      setItems(res.items || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load databases';
      setError(message);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCredentials = useCallback(async (databaseId: string) => {
    try {
      setIsLoadingCredentials(true);
      setCredentialsError(null);
      const creds = await apiFetch<{
        username: string;
        password: string;
        host: string;
        port: number;
        readReplicaHost?: string;
        readReplicaPort?: number;
        engine: string;
      }>(`databases/${encodeURIComponent(databaseId)}/credentials`);
      setCredentials(creds);
      setIsPasswordRevealed(false);
    } catch (err: any) {
      setCredentials(null);
      setCredentialsError(err?.message || 'Failed to load credentials');
    } finally {
      setIsLoadingCredentials(false);
    }
  }, []);

  const handleResetPassword = async () => {
    if (!selected || !newPassword.trim() || newPassword.length < 8) {
      alert('Password must be at least 8 characters long');
      return;
    }

    try {
      setIsResettingPassword(true);
      await apiFetch(`databases/${encodeURIComponent(selected.id)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      setResetPasswordModalOpen(false);
      setNewPassword('');
      await loadCredentials(selected.id);
      alert('Password reset successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
      alert(message);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const generateConnectionString = (engine: string, host: string, port: number, username: string, password: string, dbName?: string): string => {
    switch (engine.toLowerCase()) {
      case 'mysql':
      case 'mariadb':
        return `mysql -u ${username} -p -h ${host} -P ${port}${dbName ? ` -D ${dbName}` : ''}`;
      case 'postgres':
        return `psql "host=${host} port=${port} user=${username} password=${password}${dbName ? ` dbname=${dbName}` : ''}"`;
      case 'redis':
        return `redis-cli -h ${host} -p ${port} -a ${password}`;
      default:
        return `${engine}://${username}:${password}@${host}:${port}${dbName ? `/${dbName}` : ''}`;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could show a toast here
    }).catch(() => {
      alert('Failed to copy to clipboard');
    });
  };

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  // Load credentials when a database is selected
  useEffect(() => {
    if (selected && selected.status === 'available') {
      void loadCredentials(selected.id);
    } else {
      setCredentials(null);
      setCredentialsError(null);
      setIsPasswordRevealed(false);
    }
  }, [selected, loadCredentials]);

  // Auto-refresh when databases are in transitional states (creating, modifying, etc.)
  useEffect(() => {
    const hasTransitionalState = items.some(
      (db) => db.status === 'creating' || db.status === 'modifying' || db.status === 'backing-up'
    );

    if (!hasTransitionalState) return;

    const interval = setInterval(() => {
      void loadDatabases();
    }, 10000); // Refresh every 10 seconds while databases are being created/modified

    return () => clearInterval(interval);
  }, [items, loadDatabases]);

  // Load configured AWS region for defaulting and display
  useEffect(() => {
    (async () => {
      try {
        const settings = await apiFetch<ServerSettings>('settings/server');
        if (settings?.awsRegion) {
          setAwsRegion(settings.awsRegion);
        }
      } catch {
        // ignore; fall back to us-east-1
      }
    })();
  }, []);

  const handleDelete = async (db: AwsDatabase) => {
    if (!confirm(`Delete database "${db.name}"? This is irreversible.`)) return;
    try {
      setIsDeleting(db.id);
      await apiFetch(`databases/${encodeURIComponent(db.id)}`, { method: 'DELETE' });
      await loadDatabases();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete database';
      alert(message);
    } finally {
      setIsDeleting(null);
    }
  };

  const openAddModal = () => {
    setModalMode('add');
    setEditingDb(null);
    setFormName('');
    setFormEngine('mysql');
    setFormRegion(awsRegion || 'us-east-1');
    setFormInstanceSize('db.t3.micro');
    setFormStorageSize(20);
    setFormAutoscaling(true);
    setFormUsername('');
    setFormPassword('');
    setFormBackupRetention(7);
    setFormMaintenanceWindow('Sun:03:00-Sun:04:00');
    setFormPubliclyAccessible(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (db: AwsDatabase) => {
    setModalMode('edit');
    setEditingDb(db);
    setFormName(db.name);
    setFormEngine(db.engine);
    setFormRegion(db.region);
    setFormInstanceSize((db.settings?.instanceSize as string) || 'db.t3.micro');
    setFormStorageSize((db.settings?.storageSize as number) || 20);
    setFormAutoscaling((db.settings?.autoscaling as boolean) ?? true);
    setFormUsername((db.settings?.username as string) || '');
    setFormPassword(''); // never pre-fill password
    setFormBackupRetention((db.settings?.backupRetention as number) || 7);
    setFormMaintenanceWindow((db.settings?.maintenanceWindow as string) || 'Sun:03:00-Sun:04:00');
    setFormPubliclyAccessible((db.settings?.publiclyAccessible as boolean) ?? false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDb(null);
  };

  const handleSave = async () => {
    try {
      if (!formName.trim()) {
        setFormError('Database name is required.');
        return;
      }
      if (!formUsername.trim()) {
        setFormError('Username is required.');
        return;
      }
      if (modalMode === 'add' && !formPassword.trim()) {
        setFormError('Password is required for new databases.');
        return;
      }
      setIsSaving(true);
      setFormError(null);

      const payload = {
        name: formName.trim(),
        engine: formEngine,
        region: formRegion,
        settings: {
          instanceSize: formInstanceSize,
          storageSize: formStorageSize,
          autoscaling: formAutoscaling,
          username: formUsername.trim(),
          // Note: password would be handled/encrypted on the backend
          backupRetention: formBackupRetention,
          maintenanceWindow: formMaintenanceWindow,
          publiclyAccessible: formPubliclyAccessible,
        },
      };

      if (modalMode === 'add') {
        await apiFetch('databases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (editingDb) {
        await apiFetch(`databases/${encodeURIComponent(editingDb.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      await loadDatabases();
      setIsModalOpen(false);
      setEditingDb(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save database';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Databases</h1>
        <p className="text-sm text-slate-400">
          Browse and manage AWS databases from a single place. Purchase from Marketplace, edit settings or delete.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Catalog</h2>
            <p className="text-xs text-slate-400">Connected to your AWS account.</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand/90"
            title="Add a new database"
            onClick={openAddModal}
          >
            <Plus className="h-4 w-4" />
            Add Database
          </button>
        </div>

        {error ? (
          <div className="px-6 py-8 text-sm text-rose-200">{error}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center px-6 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">No databases found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Engine</th>
                  <th className="px-6 py-3 font-medium">Region</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Endpoint</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((db) => (
                  <tr key={db.id} className="hover:bg-slate-900/60">
                    <td className="px-6 py-3 font-medium text-white">{db.name}</td>
                    <td className="px-6 py-3 text-slate-300">{db.engine}</td>
                    <td className="px-6 py-3 text-slate-300">{db.region}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                          db.status === 'available'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : db.status === 'creating' || db.status === 'modifying' || db.status === 'backing-up'
                              ? 'bg-amber-500/20 text-amber-300'
                              : db.status === 'deleting'
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-slate-800/70 text-slate-200'
                        }`}
                      >
                        {(db.status === 'creating' || db.status === 'modifying' || db.status === 'backing-up') && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {db.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400">{db.endpoint ?? '—'}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelected(db)}
                          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={db.status === 'available' ? 'View' : 'View (only available when database is ready)'}
                          disabled={db.status !== 'available'}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(db)}
                          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={db.status === 'available' ? 'Edit' : 'Edit (only available when database is ready)'}
                          disabled={db.status !== 'available'}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void handleDelete(db)}
                          className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={db.status === 'available' ? 'Delete' : 'Delete (only available when database is ready)'}
                          disabled={isDeleting === db.id || db.status !== 'available'}
                        >
                          {isDeleting === db.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Database Details Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-6 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="mb-6 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-semibold text-white">Database Details</h3>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2">
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <div className="rounded-lg border border-slate-800 overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-800">
                        <tr>
                          <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50 w-1/3">Name</td>
                          <td className="px-4 py-3 text-white">{selected.name}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Engine</td>
                          <td className="px-4 py-3 text-white capitalize">{selected.engine}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Status</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                                selected.status === 'available'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : selected.status === 'creating' || selected.status === 'modifying' || selected.status === 'backing-up'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : selected.status === 'deleting'
                                      ? 'bg-rose-500/20 text-rose-300'
                                      : 'bg-slate-800/70 text-slate-200'
                              }`}
                            >
                              {(selected.status === 'creating' || selected.status === 'modifying' || selected.status === 'backing-up') && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              {selected.status}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Region</td>
                          <td className="px-4 py-3 text-white">{selected.region}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Created At</td>
                          <td className="px-4 py-3 text-white">
                            {new Date(selected.createdAt).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Credentials */}
                {selected.status === 'available' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Credentials</h4>
                      <button
                        onClick={() => selected && void loadCredentials(selected.id)}
                        disabled={isLoadingCredentials}
                        className="text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-50"
                      >
                        {isLoadingCredentials ? 'Loading...' : 'Refresh'}
                      </button>
                    </div>
                    {isLoadingCredentials ? (
                      <div className="flex items-center justify-center py-8 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Loading credentials...
                      </div>
                    ) : credentialsError ? (
                      <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-300">
                        {credentialsError}
                      </div>
                    ) : credentials ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-slate-800 overflow-hidden">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-800">
                              <tr>
                                <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50 w-1/3">Username</td>
                                <td className="px-4 py-3 text-white font-mono text-sm">{credentials.username}</td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Password</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm">
                                      {isPasswordRevealed ? credentials.password : '•'.repeat(16)}
                                    </span>
                                    <button
                                      onClick={() => setIsPasswordRevealed(!isPasswordRevealed)}
                                      className="p-1 text-slate-400 hover:text-white transition"
                                      title={isPasswordRevealed ? 'Hide password' : 'Reveal password'}
                                    >
                                      {isPasswordRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                    <button
                                      onClick={() => copyToClipboard(credentials.password)}
                                      className="p-1 text-slate-400 hover:text-white transition"
                                      title="Copy password"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Host</td>
                                <td className="px-4 py-3 text-white font-mono text-sm">{credentials.host}</td>
                              </tr>
                              <tr>
                                <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Port</td>
                                <td className="px-4 py-3 text-white font-mono text-sm">{credentials.port}</td>
                              </tr>
                              {credentials.readReplicaHost && (
                                <>
                                  <tr>
                                    <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Read Replica Host</td>
                                    <td className="px-4 py-3 text-white font-mono text-sm">{credentials.readReplicaHost}</td>
                                  </tr>
                                  {credentials.readReplicaPort && (
                                    <tr>
                                      <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Read Replica Port</td>
                                      <td className="px-4 py-3 text-white font-mono text-sm">{credentials.readReplicaPort}</td>
                                    </tr>
                                  )}
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Connection String</label>
                            <button
                              onClick={() => copyToClipboard(generateConnectionString(credentials.engine, credentials.host, credentials.port, credentials.username, credentials.password, selected.name))}
                              className="text-xs text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
                            >
                              <Copy className="h-3 w-3" />
                              Copy
                            </button>
                          </div>
                          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                            <code className="text-xs text-slate-300 font-mono break-all">
                              {generateConnectionString(credentials.engine, credentials.host, credentials.port, credentials.username, credentials.password, selected.name)}
                            </code>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setResetPasswordModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
                          >
                            <KeyRound className="h-4 w-4" />
                            Reset Password
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
                        Credentials not available
                      </div>
                    )}
                  </div>
                )}

                {/* Connection Information (if endpoint is shown separately) */}
                {selected.endpoint && !credentials && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Connection</h4>
                    <div className="rounded-lg border border-slate-800 overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-800">
                          <tr>
                            <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50 w-1/3">Endpoint</td>
                            <td className="px-4 py-3 text-white font-mono text-sm">{selected.endpoint}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Settings */}
                {selected.settings && Object.keys(selected.settings).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Configuration</h4>
                    <div className="rounded-lg border border-slate-800 overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-800">
                          {selected.settings?.instanceClass ? (
                            <tr>
                              <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50 w-1/3">Instance Class</td>
                              <td className="px-4 py-3 text-white">{String(selected.settings.instanceClass)}</td>
                            </tr>
                          ) : null}
                          {selected.settings?.allocatedStorage ? (
                            <tr>
                              <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Storage</td>
                              <td className="px-4 py-3 text-white">
                                {String(selected.settings.allocatedStorage)} GB
                                {selected.settings?.storageType ? (
                                  <span className="text-slate-400 ml-2">({String(selected.settings.storageType)})</span>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                          {selected.settings?.multiAZ !== undefined ? (
                            <tr>
                              <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Multi-AZ</td>
                              <td className="px-4 py-3 text-white">
                                {selected.settings?.multiAZ ? (
                                  <span className="text-emerald-400">Enabled</span>
                                ) : (
                                  <span className="text-slate-400">Disabled</span>
                                )}
                              </td>
                            </tr>
                          ) : null}
                          {selected.settings?.publiclyAccessible !== undefined ? (
                            <tr>
                              <td className="px-4 py-3 text-slate-400 font-medium bg-slate-900/50">Publicly Accessible</td>
                              <td className="px-4 py-3 text-white">
                                {selected.settings?.publiclyAccessible ? (
                                  <span className="text-emerald-400">Yes</span>
                                ) : (
                                  <span className="text-slate-400">No</span>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordModalOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Reset Password</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">New Password (min 8 characters)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  placeholder="Enter new password"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setResetPasswordModalOpen(false);
                    setNewPassword('');
                  }}
                  disabled={isResettingPassword}
                  className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleResetPassword()}
                  disabled={isResettingPassword || newPassword.length < 8}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isResettingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List More Engines */}
      <div className="mt-6">
        <button
          onClick={() => setShowMoreEngines((v) => !v)}
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm underline"
        >
          {showMoreEngines ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span>List More Databases…</span>
        </button>

        {showMoreEngines && (
          <div className="mt-3 bg-slate-900 p-4 rounded-lg border border-slate-800">
            <p className="text-sm text-gray-400 mb-2">Additional AWS engines:</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-300 text-sm">
              <li>• Aurora MySQL</li>
              <li>• Aurora Postgres</li>
              <li>• DynamoDB</li>
              <li>• DocumentDB</li>
              <li>• Memcached</li>
              <li>• Keyspaces</li>
              <li>• Neptune</li>
              <li>• OpenSearch</li>
              <li>• Timestream</li>
              <li>• QLDB</li>
            </ul>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-slate-900 w-full max-w-xl rounded-xl border border-slate-800 p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">{modalMode === 'add' ? 'Add Database' : 'Edit Database'}</h2>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Basic Settings */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Basic Settings</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Database Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-600"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Engine</label>
                      <select
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                        value={formEngine}
                        onChange={(e) => setFormEngine(e.target.value)}
                      >
                        {/* Default hosting engines */}
                        <option value="mysql">MySQL</option>
                        <option value="mariadb">MariaDB</option>
                        <option value="postgres">PostgreSQL</option>
                        <option value="redis">Redis</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Region</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-slate-800/70 border border-slate-700 rounded-lg text-slate-400 cursor-not-allowed"
                        value={formRegion}
                        disabled
                        readOnly
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Instance Size</label>
                    <select
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                      value={formInstanceSize}
                      onChange={(e) => setFormInstanceSize(e.target.value)}
                    >
                      <option value="db.t3.micro">db.t3.micro</option>
                      <option value="db.t3.small">db.t3.small</option>
                      <option value="db.t3.medium">db.t3.medium</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Storage */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Storage</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Storage Size (GB)</label>
                    <input
                      type="number"
                      min={5}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                      value={formStorageSize}
                      onChange={(e) => setFormStorageSize(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="autoscaling"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                      checked={formAutoscaling}
                      onChange={(e) => setFormAutoscaling(e.target.checked)}
                    />
                    <label htmlFor="autoscaling" className="text-sm text-slate-300">
                      Enable storage autoscaling
                    </label>
                  </div>
                </div>
              </div>

              {/* Credentials */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Credentials</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Username</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Password</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={modalMode === 'edit' ? 'Leave blank to keep current' : ''}
                    />
                  </div>
                </div>
              </div>

              {/* Advanced */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase">Advanced</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Backup Retention (days)</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                        value={formBackupRetention}
                        onChange={(e) => setFormBackupRetention(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Maintenance Window</label>
                      <select
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                        value={formMaintenanceWindow}
                        onChange={(e) => setFormMaintenanceWindow(e.target.value)}
                      >
                        {maintenanceWindowOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="public-access"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                      checked={formPubliclyAccessible}
                      onChange={(e) => setFormPubliclyAccessible(e.target.checked)}
                    />
                    <label htmlFor="public-access" className="text-sm text-slate-300">
                      Publicly accessible
                    </label>
                  </div>
                    {/* VPC and Subnets are omitted; use account defaults */}
                </div>
              </div>

              {formError && (
                <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {formError}
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50"
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


