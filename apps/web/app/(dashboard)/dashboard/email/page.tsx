"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Dialog, Menu, Transition } from '@headlessui/react';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Mail, Search, Trash2, X, RefreshCw, AlertTriangle, Shield, Ban, Unlock, Pause, Play, Plus, Download, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../../lib/api';

interface SESEmailIdentity {
  email: string;
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
  verificationToken?: string;
  auth?: {
    dkim: 'Enabled' | 'Pending' | 'Failed';
    spf: 'Enabled' | 'Pending' | 'Failed';
    dmarc?: 'Enabled' | 'Pending' | 'Failed';
  };
  bounceRate?: number;
  complaintRate?: number;
  volume?: number;
  risk?: 'Low' | 'Medium' | 'High';
}

interface EmailManagementOverview {
  identities: SESEmailIdentity[];
  sendQuota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  } | null;
  domains: string[];
}

// Monitoring data interfaces - matches backend API response
interface MonitoringData {
  sendQuota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
    peakSendRateLastHour: number;
  };
  sendingEnabled: boolean;
  reputation: {
    status: 'Healthy' | 'Warning' | 'Critical';
    bounceRate: number;
    complaintRate: number;
  };
  today: {
    emailsSent: number;
    bounces: number;
    complaints: number;
    deliveries: number;
  };
  deliverability: {
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
  };
  domainStats: Array<{
    domain: string;
    delivery: number;
    bounce: number;
    complaint: number;
  }>;
  verifiedIdentities: Array<{
    identity: string;
    type: 'Domain' | 'Email';
    status: 'Verified' | 'Pending';
    details: string;
  }>;
  suppression: {
    bounce: number;
    complaint: number;
  };
  dedicatedIPs: Array<{
    ip: string;
    pool: string;
    warmup: number;
    status: 'Healthy' | 'Warming' | 'At Risk';
  }>;
  configSets: Array<{
    name: string;
    eventDestinations: string;
    ipPool?: string;
  }>;
  recentEvents: Array<{
    time: string;
    type: 'Send' | 'Bounce' | 'Complaint';
    recipient: string;
    status: string;
  }>;
}

// Monitoring data interface matches backend response

function SecurityTab() {
  const [suppressionList, setSuppressionList] = useState<SuppressedDestination[]>([]);
  const [suppressionStats, setSuppressionStats] = useState<SuppressionStats>({ bounce: 0, complaint: 0, total: 0 });
  const [sendingStatus, setSendingStatus] = useState<AccountSendingStatus>({ enabled: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<'BOUNCE' | 'COMPLAINT' | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [newSuppressionEmail, setNewSuppressionEmail] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const loadSuppressionList = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const reason = selectedReason === 'ALL' ? undefined : selectedReason;
      const response = await apiFetch<SuppressionListResponse>(`email/security/suppression/list?reason=${reason || ''}&pageSize=100`);
      setSuppressionList(response.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load suppression list';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSuppressionStats = async () => {
    try {
      const stats = await apiFetch<SuppressionStats>('email/security/suppression/stats');
      setSuppressionStats(stats);
    } catch (err) {
      console.error('Failed to load suppression stats', err);
    }
  };

  const loadSendingStatus = async () => {
    try {
      const status = await apiFetch<AccountSendingStatus>('email/security/sending-status');
      setSendingStatus(status);
    } catch (err) {
      console.error('Failed to load sending status', err);
    }
  };

  useEffect(() => {
    void loadSuppressionList();
    void loadSuppressionStats();
    void loadSendingStatus();
  }, [selectedReason]);

  const handlePauseSending = async () => {
    if (!confirm('Are you sure you want to PAUSE all account-level sending? This will stop ALL emails from being sent.')) {
      return;
    }

    setIsActionLoading((prev) => ({ ...prev, pause: true }));
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await apiFetch<SecurityActionResponse>('email/security/pause-sending', { method: 'POST' });
      setSuccessMessage(result.message);
      await loadSendingStatus();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pause sending';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, pause: false }));
    }
  };

  const handleResumeSending = async () => {
    if (!confirm('Are you sure you want to RESUME account-level sending?')) {
      return;
    }

    setIsActionLoading((prev) => ({ ...prev, resume: true }));
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await apiFetch<SecurityActionResponse>('email/security/resume-sending', { method: 'POST' });
      setSuccessMessage(result.message);
      await loadSendingStatus();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume sending';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, resume: false }));
    }
  };

  const handleAddToSuppression = async (email: string, reason: 'BOUNCE' | 'COMPLAINT') => {
    setIsActionLoading((prev) => ({ ...prev, [`add-${email}`]: true }));
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await apiFetch<SecurityActionResponse>('email/security/suppression/add', {
        method: 'POST',
        body: JSON.stringify({ emailAddress: email, reason }),
      });
      setSuccessMessage(result.message);
      await loadSuppressionList();
      await loadSuppressionStats();
      setNewSuppressionEmail('');
      setShowAddModal(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add to suppression list';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, [`add-${email}`]: false }));
    }
  };

  const handleRemoveFromSuppression = async (email: string) => {
    if (!confirm(`Remove ${email} from suppression list?`)) {
      return;
    }

    setIsActionLoading((prev) => ({ ...prev, [`remove-${email}`]: true }));
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await apiFetch<SecurityActionResponse>('email/security/suppression/remove', {
        method: 'POST',
        body: JSON.stringify({ emailAddress: email }),
      });
      setSuccessMessage(result.message);
      await loadSuppressionList();
      await loadSuppressionStats();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove from suppression list';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, [`remove-${email}`]: false }));
    }
  };

  const handleBulkAdd = async () => {
    const emails = bulkEmails
      .split('\n')
      .map((e) => e.trim())
      .filter((e) => e && e.includes('@'));
    
    if (emails.length === 0) {
      setError('Please enter at least one valid email address');
      return;
    }

    if (!confirm(`Add ${emails.length} email(s) to ${selectedReason === 'ALL' ? 'suppression' : selectedReason.toLowerCase()} list?`)) {
      return;
    }

    setIsActionLoading((prev) => ({ ...prev, bulk: true }));
    setError(null);
    setSuccessMessage(null);
    try {
      const reason = selectedReason === 'ALL' ? 'BOUNCE' : selectedReason;
      const result = await apiFetch<{ success: number; failed: number; errors: Array<{ email: string; error: string }> }>(
        'email/security/suppression/bulk-add',
        {
          method: 'POST',
          body: JSON.stringify({ emailAddresses: emails, reason }),
        },
      );
      setSuccessMessage(
        `Bulk operation completed: ${result.success} added, ${result.failed} failed${result.errors.length > 0 ? `. Errors: ${result.errors.map((e) => e.email).join(', ')}` : ''}`,
      );
      await loadSuppressionList();
      await loadSuppressionStats();
      setBulkEmails('');
      setShowBulkModal(false);
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to bulk add to suppression list';
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, bulk: false }));
    }
  };

  const filteredSuppressionList = useMemo(() => {
    if (!searchTerm) return suppressionList;
    const search = searchTerm.toLowerCase();
    return suppressionList.filter((item) => item.emailAddress.toLowerCase().includes(search));
  }, [suppressionList, searchTerm]);

  if (isLoading) {
    return <div className="text-center py-12 text-slate-400">Loading security data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {successMessage}
        </div>
      )}

      {/* Emergency Controls */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Emergency Controls</h2>
            <p className="text-sm text-slate-400 mt-1">Immediately stop or resume all email sending</p>
          </div>
          <div className="flex items-center gap-3">
            {sendingStatus.enabled ? (
              <button
                onClick={handlePauseSending}
                disabled={isActionLoading.pause}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActionLoading.pause ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pausing...
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause All Sending
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleResumeSending}
                disabled={isActionLoading.resume}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActionLoading.resume ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Resuming...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Resume Sending
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <div className={`rounded-lg p-4 ${sendingStatus.enabled ? 'bg-emerald-500/10 border border-emerald-500/40' : 'bg-rose-500/10 border border-rose-500/40'}`}>
          <div className="flex items-center gap-2">
            {sendingStatus.enabled ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-300">Sending is ENABLED</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-rose-400" />
                <span className="text-sm font-semibold text-rose-300">Sending is PAUSED</span>
              </>
            )}
            <span className="text-xs text-slate-400 ml-2">
              {sendingStatus.enabled
                ? 'All verified identities can send emails'
                : 'All email sending is blocked at the account level'}
            </span>
          </div>
        </div>
      </section>

      {/* Suppression List Management */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Suppression List Management</h2>
            <p className="text-sm text-slate-400 mt-1">
              Manage emails that should not receive messages (bounces and complaints)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm transition"
            >
              <Upload className="h-4 w-4" />
              Bulk Add
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm transition"
            >
              <Plus className="h-4 w-4" />
              Add Email
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs text-slate-400 mb-1">Total Suppressed</p>
            <p className="text-2xl font-semibold text-slate-200">{suppressionStats.total.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs text-slate-400 mb-1">Bounce Suppressions</p>
            <p className="text-2xl font-semibold text-amber-300">{suppressionStats.bounce.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs text-slate-400 mb-1">Complaint Suppressions</p>
            <p className="text-2xl font-semibold text-rose-300">{suppressionStats.complaint.toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Filter by reason:</label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value as 'BOUNCE' | 'COMPLAINT' | 'ALL')}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="ALL">All</option>
              <option value="BOUNCE">Bounce</option>
              <option value="COMPLAINT">Complaint</option>
            </select>
          </div>
          <div className="flex items-center flex-1 max-w-md rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search suppression list..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent focus:outline-none w-full text-slate-200 placeholder:text-slate-500 text-sm"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-200 ml-2">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={loadSuppressionList}
            className="px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-sm transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Suppression List Table */}
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Email Address</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredSuppressionList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    {suppressionList.length === 0 ? 'No suppressed emails found' : 'No matching emails found'}
                  </td>
                </tr>
              ) : (
                filteredSuppressionList.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/60">
                    <td className="px-4 py-3 font-medium text-slate-200">{item.emailAddress}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          item.reason === 'BOUNCE'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/40'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {item.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(item.lastUpdateTime).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRemoveFromSuppression(item.emailAddress)}
                          disabled={isActionLoading[`remove-${item.emailAddress}`]}
                          className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          title="Remove from suppression list"
                        >
                          {isActionLoading[`remove-${item.emailAddress}`] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Unlock className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Suppression Modal */}
      <Transition appear show={showAddModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowAddModal(false)}>
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
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 shadow-xl">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                    Add to Suppression List
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-slate-400">
                    Add an email address to prevent future sending attempts.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                      <input
                        type="email"
                        value={newSuppressionEmail}
                        onChange={(e) => setNewSuppressionEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Reason</label>
                      <select
                        value={selectedReason === 'ALL' ? 'BOUNCE' : selectedReason}
                        onChange={(e) => setSelectedReason(e.target.value as 'BOUNCE' | 'COMPLAINT')}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="BOUNCE">Bounce</option>
                        <option value="COMPLAINT">Complaint</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        onClick={() => {
                          setShowAddModal(false);
                          setNewSuppressionEmail('');
                        }}
                        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (newSuppressionEmail) {
                            void handleAddToSuppression(
                              newSuppressionEmail,
                              selectedReason === 'ALL' ? 'BOUNCE' : selectedReason,
                            );
                          }
                        }}
                        disabled={!newSuppressionEmail || isActionLoading[`add-${newSuppressionEmail}`]}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isActionLoading[`add-${newSuppressionEmail}`] ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Add
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Bulk Add Modal */}
      <Transition appear show={showBulkModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowBulkModal(false)}>
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
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 shadow-xl">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                    Bulk Add to Suppression List
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-slate-400">
                    Add multiple email addresses (one per line) to the suppression list.
                  </p>
                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Email Addresses</label>
                      <textarea
                        value={bulkEmails}
                        onChange={(e) => setBulkEmails(e.target.value)}
                        placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                        rows={8}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono text-sm"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Enter one email address per line. Invalid emails will be skipped.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Reason</label>
                      <select
                        value={selectedReason === 'ALL' ? 'BOUNCE' : selectedReason}
                        onChange={(e) => setSelectedReason(e.target.value as 'BOUNCE' | 'COMPLAINT')}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="BOUNCE">Bounce</option>
                        <option value="COMPLAINT">Complaint</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        onClick={() => {
                          setShowBulkModal(false);
                          setBulkEmails('');
                        }}
                        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleBulkAdd}
                        disabled={!bulkEmails.trim() || isActionLoading.bulk}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isActionLoading.bulk ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            Bulk Add
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

function EventRow({ event, isLast, getEventStatusColor }: { event: { time: string; type: string; recipient: string; status: string }; isLast: boolean; getEventStatusColor: (status: string) => string }) {
  const [isAdding, setIsAdding] = useState(false);

  const handleSuppress = async (reason: 'BOUNCE' | 'COMPLAINT') => {
    if (!confirm(`Add ${event.recipient} to ${reason.toLowerCase()} suppression list?`)) return;
    setIsAdding(true);
    try {
      await apiFetch<SecurityActionResponse>('email/security/suppression/add', {
        method: 'POST',
        body: JSON.stringify({ emailAddress: event.recipient, reason }),
      });
      alert(`${event.recipient} added to suppression list`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add to suppression list');
    } finally {
      setIsAdding(false);
    }
  };

  const shouldShowSuppress = event.type === 'Bounce' || event.type === 'Complaint' || event.status.includes('Bounce') || event.status.includes('Complaint');

  return (
    <tr className={isLast ? '' : 'border-b border-slate-800'}>
      <td className="py-2">{event.time}</td>
      <td>{event.type}</td>
      <td className="font-medium text-slate-200">{event.recipient}</td>
      <td className={getEventStatusColor(event.status)}>{event.status}</td>
      <td className="py-2 text-right">
        {shouldShowSuppress && (
          <button
            onClick={() => handleSuppress(event.type === 'Complaint' || event.status.includes('Complaint') ? 'COMPLAINT' : 'BOUNCE')}
            disabled={isAdding}
            className="text-amber-400 hover:text-amber-300 hover:underline text-[10px] disabled:opacity-50"
            title="Add to suppression list"
          >
            {isAdding ? 'Adding...' : 'Suppress'}
          </button>
        )}
      </td>
    </tr>
  );
}

function DomainStatRow({ domain, bounce, complaint, isLast }: { domain: string; bounce: number; complaint: number; isLast: boolean }) {
  const [isBlocking, setIsBlocking] = useState(false);

  const handleBlockDomain = async () => {
    if (!confirm(`Block domain ${domain} from sending emails? This will prevent all emails from this domain.`)) return;
    setIsBlocking(true);
    try {
      await apiFetch<SecurityActionResponse>('email/security/identity/block', {
        method: 'POST',
        body: JSON.stringify({ identity: domain }),
      });
      alert(`Domain ${domain} has been blocked`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to block domain');
    } finally {
      setIsBlocking(false);
    }
  };

  const isProblematic = bounce > 5 || complaint > 0.1;

  return (
    <tr className={isLast ? '' : 'border-b border-slate-800'}>
      <td className="py-2 font-medium text-slate-200">{domain}</td>
      <td className={bounce > 5 ? 'text-amber-400' : 'text-slate-300'}>{bounce}%</td>
      <td className={bounce > 5 ? 'text-rose-400' : 'text-slate-300'}>{bounce}%</td>
      <td className={complaint > 0.1 ? 'text-rose-400' : 'text-slate-300'}>{complaint}%</td>
      <td className="py-2 text-right">
        {isProblematic && (
          <button
            onClick={handleBlockDomain}
            disabled={isBlocking}
            className="text-rose-400 hover:text-rose-300 hover:underline text-[10px] disabled:opacity-50"
            title="Block this domain from sending"
          >
            {isBlocking ? 'Blocking...' : 'Block Domain'}
          </button>
        )}
      </td>
    </tr>
  );
}

function IdentityListItem({ identity, type, status, details }: { identity: string; type: 'Domain' | 'Email'; status: 'Verified' | 'Pending'; details: string }) {
  const [isBlocked, setIsBlocked] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkBlocked = async () => {
      try {
        const result = await apiFetch<{ identity: string; isBlocked: boolean }>(`email/security/identity/blocked?identity=${encodeURIComponent(identity)}`);
        setIsBlocked(result.isBlocked);
      } catch {
        setIsBlocked(false);
      } finally {
        setIsChecking(false);
      }
    };
    void checkBlocked();
  }, [identity]);

  const handleBlock = async () => {
    if (!confirm(`Block ${identity} from sending emails?`)) return;
    setIsLoading(true);
    try {
      await apiFetch<SecurityActionResponse>('email/security/identity/block', {
        method: 'POST',
        body: JSON.stringify({ identity }),
      });
      setIsBlocked(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to block identity');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!confirm(`Unblock ${identity} to allow sending?`)) return;
    setIsLoading(true);
    try {
      await apiFetch<SecurityActionResponse>('email/security/identity/unblock', {
        method: 'POST',
        body: JSON.stringify({ identity }),
      });
      setIsBlocked(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unblock identity');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Verified':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40';
      case 'Pending':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/40';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/40';
    }
  };

  return (
    <li className="flex items-center justify-between group">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-slate-200">{identity}</p>
          {isBlocked && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/40">
              BLOCKED
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">{details}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-[10px] border ${getStatusColor(status)}`}>
          {status}
        </span>
        {!isChecking && (
          <button
            onClick={isBlocked ? handleUnblock : handleBlock}
            disabled={isLoading}
            className={`opacity-0 group-hover:opacity-100 transition p-1 rounded ${
              isBlocked
                ? 'text-emerald-400 hover:text-emerald-300'
                : 'text-rose-400 hover:text-rose-300'
            } disabled:opacity-50`}
            title={isBlocked ? 'Unblock identity' : 'Block identity'}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isBlocked ? (
              <Unlock className="h-3 w-3" />
            ) : (
              <Ban className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    </li>
  );
}

function MonitoringTab() {
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMonitoringData = async () => {
    try {
      setError(null);
      const data = await apiFetch<MonitoringData>('email/monitoring');
      setMonitoringData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load monitoring data';
      setError(message);
      console.error('Failed to load monitoring data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMonitoringData();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadMonitoringData();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="text-center py-12 text-slate-400">Loading monitoring data...</div>
    );
  }

  if (error || !monitoringData) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
        {error ?? 'Failed to load monitoring data'}
      </div>
    );
  }

  const usagePercent = monitoringData.sendQuota.max24HourSend > 0
    ? (monitoringData.sendQuota.sentLast24Hours / monitoringData.sendQuota.max24HourSend) * 100
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Verified':
      case 'Healthy':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40';
      case 'Pending':
      case 'Warming':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/40';
      case 'At Risk':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/40';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/40';
    }
  };

  const getEventStatusColor = (status: string) => {
    if (status.includes('Delivered') || status.includes('Opened') || status.includes('Clicked')) {
      return 'text-emerald-400';
    }
    if (status.includes('Bounce')) {
      return 'text-amber-400';
    }
    return 'text-sky-400';
  };

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Sending Quota */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">24h Sending Quota</p>
            <p className="text-xl font-semibold">{monitoringData.sendQuota.max24HourSend.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-1">Max24HourSend</p>
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Sent last 24h: <span className="text-slate-200">{monitoringData.sendQuota.sentLast24Hours.toLocaleString()}</span> ({Math.round(usagePercent)}%)
              </p>
            </div>
          </div>

          {/* Max Send Rate */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Max Send Rate</p>
            <p className="text-xl font-semibold">{monitoringData.sendQuota.maxSendRate} / sec</p>
            <p className="text-[11px] text-slate-400 mt-1">Peak last hour: {monitoringData.sendQuota.peakSendRateLastHour} / sec</p>
            <p className={`text-[11px] mt-2 ${monitoringData.sendingEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
              {monitoringData.sendingEnabled ? 'Sending Enabled' : 'Sending Disabled'}
            </p>
          </div>

          {/* Reputation */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Account Reputation</p>
              {monitoringData.reputation.status === 'Critical' && (
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              )}
            </div>
            <p className={`text-xl font-semibold ${
              monitoringData.reputation.status === 'Healthy' ? 'text-emerald-400' :
              monitoringData.reputation.status === 'Warning' ? 'text-amber-400' :
              'text-rose-400'
            }`}>
              {monitoringData.reputation.status}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Bounce: <span className={`${monitoringData.reputation.bounceRate > 5 ? 'text-rose-400' : monitoringData.reputation.bounceRate > 2 ? 'text-amber-400' : 'text-slate-200'}`}>{monitoringData.reputation.bounceRate}%</span> · Complaint: <span className={`${monitoringData.reputation.complaintRate > 0.1 ? 'text-rose-400' : monitoringData.reputation.complaintRate > 0.05 ? 'text-amber-400' : 'text-slate-200'}`}>{monitoringData.reputation.complaintRate}%</span>
            </p>
            {monitoringData.reputation.status !== 'Healthy' && (
              <button
                onClick={() => {
                  const tabButton = document.querySelector('[aria-label="Tabs"] button:nth-child(2)') as HTMLButtonElement;
                  if (tabButton) tabButton.click();
                }}
                className="mt-2 text-[11px] text-rose-400 hover:text-rose-300 underline"
              >
                View Security Controls →
              </button>
            )}
          </div>

          {/* Today summary */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Today</p>
            <p className="text-xl font-semibold">{monitoringData.today.emailsSent.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-1">Emails sent</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Bounces: <span className="text-slate-200">{monitoringData.today.bounces}</span> · Complaints: <span className="text-slate-200">{monitoringData.today.complaints}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Middle Grid: Deliverability + Identities */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deliverability & Domain Stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Deliverability Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Deliverability Overview</h2>
              <span className="text-[11px] text-slate-500">Last 7 days</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[11px] text-slate-400 mb-1">Delivery Rate</p>
                <p className="text-base font-semibold text-emerald-400">{monitoringData.deliverability.deliveryRate}%</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 mb-1">Bounce Rate</p>
                <p className="text-base font-semibold text-amber-400">{monitoringData.deliverability.bounceRate}%</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 mb-1">Complaint Rate</p>
                <p className="text-base font-semibold text-amber-400">{monitoringData.deliverability.complaintRate}%</p>
              </div>
            </div>
          </div>

          {/* Domain Statistics Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Domain Statistics</h2>
              <button className="text-[11px] text-slate-400 hover:text-slate-200">
                View deliverability tests →
              </button>
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-2 text-left">Domain</th>
                  <th className="py-2 text-left">Delivery</th>
                  <th className="py-2 text-left">Bounce</th>
                  <th className="py-2 text-left">Complaint</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {monitoringData.domainStats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 text-xs">No domain statistics available</td>
                  </tr>
                ) : (
                  monitoringData.domainStats.map((stat, idx) => (
                    <DomainStatRow key={idx} domain={stat.domain} bounce={stat.bounce} complaint={stat.complaint} isLast={idx === monitoringData.domainStats.length - 1} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Identities */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Verified Identities</h2>
              <button className="text-[11px] text-slate-400 hover:text-slate-200">Manage →</button>
            </div>
            <ul className="space-y-2 text-xs">
              {monitoringData.verifiedIdentities.map((identity, idx) => (
                <IdentityListItem key={idx} identity={identity.identity} type={identity.type} status={identity.status} details={identity.details} />
              ))}
            </ul>
          </div>

          {/* Suppression Summary */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Suppression List</h2>
              <button className="text-[11px] text-slate-400 hover:text-slate-200">View all →</button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center text-xs">
              <div>
                <p className="text-slate-400 mb-1">Suppressed (Bounce)</p>
                <p className="text-base font-semibold text-amber-300">{monitoringData.suppression.bounce.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">Suppressed (Complaint)</p>
                <p className="text-base font-semibold text-amber-300">{monitoringData.suppression.complaint.toLocaleString()}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              Account-level suppression enabled. SES will not send to these recipients.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom Grid: IPs, Config Sets, Recent Events */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dedicated IPs & Pools */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Dedicated IPs</h2>
              <button className="text-[11px] text-slate-400 hover:text-slate-200">Manage →</button>
            </div>
            <ul className="space-y-2 text-xs">
              {monitoringData.dedicatedIPs.map((ip, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200">{ip.ip}</p>
                    <p className="text-[11px] text-slate-500">Pool: {ip.pool} · Warmup: {ip.warmup}%</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${getStatusColor(ip.status)}`}>
                    {ip.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Configuration Sets */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Configuration Sets</h2>
              <button className="text-[11px] text-slate-400 hover:text-slate-200">View all →</button>
            </div>
            <ul className="space-y-2 text-xs">
              {monitoringData.configSets.map((set, idx) => (
                <li key={idx}>
                  <p className="text-slate-200">{set.name}</p>
                  <p className="text-[11px] text-slate-500">
                    Event Destinations: {set.eventDestinations}{set.ipPool ? ` · IP Pool: ${set.ipPool}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recent Events / Logs */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">Recent Sending Events</h2>
            <span className="text-[11px] text-slate-500">Last 60 minutes</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="py-2 text-left">Time</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Recipient</th>
                <th className="py-2 text-left">Campaign</th>
                <th className="py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {monitoringData.recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400 text-xs">No recent events available</td>
                </tr>
              ) : (
                monitoringData.recentEvents.map((event, idx) => (
                  <tr key={idx} className={idx < monitoringData.recentEvents.length - 1 ? 'border-b border-slate-800' : ''}>
                    <td className="py-2">{event.time}</td>
                    <td>{event.type}</td>
                    <td>{event.recipient}</td>
                    <td>—</td>
                    <td className={getEventStatusColor(event.status)}>{event.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function VerifiedEmailsTab({
  data,
  isLoading,
  error,
  onRefresh,
}: {
  data: EmailManagementOverview | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'volume'>('risk');
  const [isActionLoading, setIsActionLoading] = useState<Record<string, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<SESEmailIdentity | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const handleVerifyEmail = async (email: string) => {
    setIsActionLoading((prev) => ({ ...prev, [email]: true }));
    setActionMessage(null);
    try {
      await apiFetch('email/identities/verify', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setActionMessage({
        type: 'success',
        text: `Verification email sent to ${email}. Please check your inbox.`,
      });
      await onRefresh();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send verification email';
      setActionMessage({
        type: 'error',
        text: message,
      });
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, [email]: false }));
    }
  };

  const handleDeleteIdentity = async (identity: string) => {
    if (!confirm(`Are you sure you want to delete ${identity}? This action cannot be undone.`)) {
      return;
    }

    const actualIdentity = identity.startsWith('*@') ? identity.substring(2) : identity;

    setIsActionLoading((prev) => ({ ...prev, [identity]: true }));
    setActionMessage(null);
    try {
      await apiFetch(`email/identities/${encodeURIComponent(actualIdentity)}`, {
        method: 'DELETE',
      });
      setActionMessage({
        type: 'success',
        text: `Identity ${identity} deleted successfully.`,
      });
      await onRefresh();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete identity';
      setActionMessage({
        type: 'error',
        text: message,
      });
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setIsActionLoading((prev) => ({ ...prev, [identity]: false }));
    }
  };

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim() === '') {
      return 'Email address is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return 'Please enter a valid email address';
    }
    if (email.includes('..') || email.startsWith('.') || email.startsWith('@')) {
      return 'Please enter a valid email address';
    }
    return null;
  };

  const handleAddEmail = async () => {
    const trimmedEmail = newEmail.trim();
    const validationError = validateEmail(trimmedEmail);
    
    if (validationError) {
      setEmailError(validationError);
      setSubmitMessage(null);
      return;
    }
    
    setEmailError(null);
    setSubmitMessage(null);
    setIsSubmitting(true);
    
    try {
      await apiFetch('email/identities/verify', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail }),
      });
      
      setSubmitMessage({
        type: 'success',
        text: `Verification email sent to ${trimmedEmail}. Please check your inbox.`,
      });
      
      await onRefresh();
      
      setTimeout(() => {
        setIsAddModalOpen(false);
        setNewEmail('');
        setSubmitMessage(null);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send verification email';
      setSubmitMessage({
        type: 'error',
        text: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAddModal = () => {
    setNewEmail('');
    setEmailError(null);
    setSubmitMessage(null);
    setIsSubmitting(false);
    setIsAddModalOpen(true);
  };

  // Filter and sort identities
  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    
    // Filter by search term
    let filtered = data.identities;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((identity) => {
        const identityName = identity.email.startsWith('*@') ? identity.email.substring(2) : identity.email;
        return identityName.toLowerCase().includes(search) || identity.domain.toLowerCase().includes(search);
      });
    }
    
    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'risk': {
          const riskOrder = { High: 3, Medium: 2, Low: 1 };
          const aRisk = riskOrder[a.risk ?? 'Low'];
          const bRisk = riskOrder[b.risk ?? 'Low'];
          if (aRisk !== bRisk) return bRisk - aRisk;
          // Secondary sort by bounce rate
          return (b.bounceRate ?? 0) - (a.bounceRate ?? 0);
        }
        case 'name': {
          const aName = a.email.startsWith('*@') ? a.email.substring(2) : a.email;
          const bName = b.email.startsWith('*@') ? b.email.substring(2) : b.email;
          return aName.localeCompare(bName);
        }
        case 'volume':
          return (b.volume ?? 0) - (a.volume ?? 0);
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [data, searchTerm, sortBy]);

  const getRiskColor = (risk?: 'Low' | 'Medium' | 'High') => {
    switch (risk) {
      case 'High':
        return 'bg-rose-500/10 text-rose-400';
      case 'Medium':
        return 'bg-amber-500/10 text-amber-300';
      case 'Low':
      default:
        return 'bg-emerald-500/10 text-emerald-300';
    }
  };

  const getAuthBadgeColor = (status: 'Enabled' | 'Pending' | 'Failed' | undefined) => {
    switch (status) {
      case 'Enabled':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40';
      case 'Failed':
        return 'bg-rose-500/10 text-rose-300 border border-rose-500/40';
      case 'Pending':
      default:
        return 'bg-sky-500/10 text-sky-300 border border-sky-500/40';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Verified':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40';
      case 'Pending':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/40';
      case 'Failed':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/40';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/40';
    }
  };

  if (isLoading) {
    return (
        <div className="text-center py-12 text-slate-400">Loading email identities...</div>
    );
  }

  if (error || !data) {
    return (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
          {error ?? 'Failed to load email identities'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Send Quota Info */}
      {data.sendQuota && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Send Quota</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Sent (Last 24h):</span>
              <span className="ml-2 font-semibold text-slate-200">
                {data.sendQuota.sentLast24Hours.toLocaleString()} / {data.sendQuota.max24HourSend.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Max Send Rate:</span>
              <span className="ml-2 font-semibold text-slate-200">
                {data.sendQuota.maxSendRate.toLocaleString()} emails/second
              </span>
            </div>
            <div>
              <span className="text-slate-400">Usage:</span>
              <span className="ml-2 font-semibold text-slate-200">
                {data.sendQuota.max24HourSend > 0
                  ? ((data.sendQuota.sentLast24Hours / data.sendQuota.max24HourSend) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Action Feedback Message */}
      {actionMessage && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            actionMessage.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Filters Section */}
      <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <input
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm w-full sm:w-72 text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          placeholder="Search domains, emails…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'risk' | 'name' | 'volume')}
        >
          <option value="risk">Sort by Risk</option>
          <option value="name">Sort by Name</option>
          <option value="volume">Sort by Volume</option>
        </select>
      </section>

      {/* Identity Protection Table */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="py-2 text-left">Identity</th>
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-left">Risk</th>
              <th className="py-2 text-left">Auth</th>
              <th className="py-2 text-left">Bounce</th>
              <th className="py-2 text-left">Complaints</th>
              <th className="py-2 text-left">Volume</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  {data?.identities.length === 0
                    ? 'No email identities found. Add an email to get started.'
                    : 'No matching identities found'}
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((identity, idx) => {
                const identityName = identity.email.startsWith('*@') ? identity.email.substring(2) : identity.email;
                const isEmail = identity.email.includes('@') && !identity.email.startsWith('*@');
                const isLoading = isActionLoading[identity.email] || isActionLoading[identityName] || false;

                return (
                  <tr
                    key={idx}
                    className={`border-b border-slate-800/70 ${identity.risk === 'High' ? '' : identity.risk === 'Medium' ? 'bg-slate-950/30' : ''}`}
                  >
                    <td className="py-3 font-medium text-slate-200">{identityName}</td>
                    <td className="py-3 text-slate-300">{isEmail ? 'Email' : 'Domain'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 text-[11px] rounded-full ${getRiskColor(identity.risk)}`}>
                        {identity.risk ?? 'Low'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {identity.auth?.dkim && (
                          <span className={`px-1.5 py-0.5 text-[10px] rounded ${getAuthBadgeColor(identity.auth.dkim)}`}>
                            {identity.auth.dkim === 'Failed' ? 'DKIM Fail' : 'DKIM'}
                          </span>
                        )}
                        {identity.auth?.spf && (
                          <span className={`px-1.5 py-0.5 text-[10px] rounded ${getAuthBadgeColor(identity.auth.spf)}`}>
                            SPF
                          </span>
                        )}
                        {identity.auth?.dmarc && (
                          <span className={`px-1.5 py-0.5 text-[10px] rounded ${getAuthBadgeColor(identity.auth.dmarc)}`}>
                            DMARC
                          </span>
                        )}
                        {!identity.auth?.dkim && !identity.auth?.spf && (
                          <span className="text-[10px] text-slate-500">—</span>
                        )}
                      </div>
                    </td>
                    <td className={`py-3 ${(identity.bounceRate ?? 0) > 2 ? 'text-amber-300' : (identity.bounceRate ?? 0) > 5 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {identity.bounceRate?.toFixed(1) ?? '0.0'}%
                    </td>
                    <td className={`py-3 ${(identity.complaintRate ?? 0) > 0.05 ? 'text-amber-300' : (identity.complaintRate ?? 0) > 0.1 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {identity.complaintRate?.toFixed(2) ?? '0.00'}%
                    </td>
                    <td className="py-3 text-slate-300">{(identity.volume ?? 0).toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 text-[10px] rounded-full ${getStatusColor(identity.status)}`}>
                        {identity.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {identity.status !== 'Verified' && (
                          <button
                            type="button"
                            onClick={() => handleVerifyEmail(identity.email)}
                            disabled={isLoading}
                            className="text-sky-300 hover:text-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            title="Send Verification Email"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteIdentity(identity.email)}
                          disabled={isLoading}
                          className="text-rose-400 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          title="Delete Identity"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                        <a
                          href="#"
                          className="text-sky-300 hover:text-sky-200 hover:underline text-sm"
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedIdentity(identity);
                            setIsDetailsModalOpen(true);
                          }}
                        >
                          {identity.risk === 'High' ? 'Inspect' : 'View'}
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Identity Details Modal */}
      <Transition appear show={isDetailsModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsDetailsModalOpen(false)}>
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
                <Dialog.Panel className="w-full max-w-7xl transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 text-left align-middle shadow-xl transition-all">
                  {/* Header */}
                  <header className="border-b border-slate-800 px-6 py-4 flex justify-between items-center">
                    <div>
                      <Dialog.Title as="h1" className="text-xl font-semibold text-white">
                        {selectedIdentity?.email.startsWith('*@') ? selectedIdentity.email.substring(2) : selectedIdentity?.email}
                      </Dialog.Title>
                      <p className="text-sm text-slate-400 mt-1">Identity Details & Protection</p>
                    </div>
                    <button
                      onClick={() => setIsDetailsModalOpen(false)}
                      className="text-sky-300 hover:text-sky-200 text-sm transition"
                    >
                      ← Back
                    </button>
                  </header>

                  {/* Content */}
                  <main className="px-6 py-6 space-y-8 max-h-[80vh] overflow-y-auto">
                    {/* Identity Info Cards */}
                    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Risk Level */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                        <h2 className="text-sm font-medium text-slate-300">Risk Level</h2>
                        <p
                          className={`text-3xl font-semibold mt-2 ${
                            selectedIdentity?.risk === 'High'
                              ? 'text-rose-400'
                              : selectedIdentity?.risk === 'Medium'
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                          }`}
                        >
                          {selectedIdentity?.risk ?? 'Low'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Score:{' '}
                          {selectedIdentity?.risk === 'High'
                            ? '85/100'
                            : selectedIdentity?.risk === 'Medium'
                              ? '62/100'
                              : '25/100'}
                        </p>
                      </div>

                      {/* Authentication */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                        <h2 className="text-sm font-medium text-slate-300">Authentication</h2>
                        <ul className="mt-3 space-y-2 text-sm">
                          <li>
                            DKIM:{' '}
                            <span
                              className={
                                selectedIdentity?.auth?.dkim === 'Enabled'
                                  ? 'text-emerald-400'
                                  : selectedIdentity?.auth?.dkim === 'Failed'
                                    ? 'text-rose-400'
                                    : 'text-amber-300'
                              }
                            >
                              {selectedIdentity?.auth?.dkim === 'Enabled'
                                ? 'Pass'
                                : selectedIdentity?.auth?.dkim === 'Failed'
                                  ? 'Fail'
                                  : 'Pending'}
                            </span>
                          </li>
                          <li>
                            SPF:{' '}
                            <span
                              className={
                                selectedIdentity?.auth?.spf === 'Enabled'
                                  ? 'text-emerald-400'
                                  : selectedIdentity?.auth?.spf === 'Failed'
                                    ? 'text-rose-400'
                                    : 'text-amber-300'
                              }
                            >
                              {selectedIdentity?.auth?.spf === 'Enabled'
                                ? 'Pass'
                                : selectedIdentity?.auth?.spf === 'Failed'
                                  ? 'Fail'
                                  : 'Pending'}
                            </span>
                          </li>
                          <li>
                            DMARC:{' '}
                            <span className={selectedIdentity?.auth?.dmarc ? 'text-emerald-400' : 'text-amber-300'}>
                              {selectedIdentity?.auth?.dmarc === 'Enabled'
                                ? 'Pass'
                                : selectedIdentity?.auth?.dmarc === 'Failed'
                                  ? 'Fail'
                                  : 'Missing'}
                            </span>
                          </li>
                          <li>
                            MAIL FROM:{' '}
                            <span
                              className={
                                selectedIdentity?.auth?.spf === 'Enabled'
                                  ? 'text-emerald-400'
                                  : selectedIdentity?.auth?.spf === 'Failed'
                                    ? 'text-rose-400'
                                    : 'text-amber-300'
                              }
                            >
                              {selectedIdentity?.auth?.spf === 'Enabled' ? 'Aligned' : 'Not Aligned'}
                            </span>
                          </li>
                        </ul>
                      </div>

                      {/* Reputation */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                        <h2 className="text-sm font-medium text-slate-300">Reputation</h2>
                        <ul className="mt-3 text-sm space-y-2">
                          <li>
                            Bounce Rate:{' '}
                            <span
                              className={
                                (selectedIdentity?.bounceRate ?? 0) > 5
                                  ? 'text-rose-400'
                                  : (selectedIdentity?.bounceRate ?? 0) > 2
                                    ? 'text-amber-300'
                                    : 'text-slate-300'
                              }
                            >
                              {selectedIdentity?.bounceRate?.toFixed(1) ?? '0.0'}%
                            </span>
                          </li>
                          <li>
                            Complaint Rate:{' '}
                            <span
                              className={
                                (selectedIdentity?.complaintRate ?? 0) > 0.1
                                  ? 'text-rose-400'
                                  : (selectedIdentity?.complaintRate ?? 0) > 0.05
                                    ? 'text-amber-300'
                                    : 'text-slate-300'
                              }
                            >
                              {selectedIdentity?.complaintRate?.toFixed(2) ?? '0.00'}%
                            </span>
                          </li>
                          <li>
                            Volume (24h): {(selectedIdentity?.volume ?? 0).toLocaleString()}
                          </li>
                        </ul>
                      </div>
                    </section>

                    {/* Reputation Trend Chart */}
                    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <h2 className="text-sm font-semibold mb-3 text-slate-200">Reputation Trend</h2>
                      <div className="h-40 bg-slate-800/50 rounded-md flex items-center justify-center text-slate-500 text-sm">
                        Chart Placeholder
                      </div>
                    </section>

                    {/* Recent SES Events */}
                    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <h2 className="text-sm font-semibold mb-3 text-slate-200">Recent SES Events</h2>
                      <div className="space-y-3 text-xs">
                        <div className="border-b border-slate-800 pb-2">
                          <p>
                            <span className="text-amber-300">BOUNCE</span> → user@corp.com
                          </p>
                          <p className="text-slate-500">Mailbox not found · 12 mins ago</p>
                        </div>
                        <div className="border-b border-slate-800 pb-2">
                          <p>
                            <span className="text-rose-300">COMPLAINT</span> → user@yahoo.com
                          </p>
                          <p className="text-slate-500">Complaint via ISP · 1 hour ago</p>
                        </div>
                        <div>
                          <p>
                            <span className="text-sky-300">DELIVERED</span> → user@gmail.com
                          </p>
                          <p className="text-slate-500">Security alert · 2 hours ago</p>
                        </div>
                      </div>
                    </section>
                  </main>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Add Email Modal */}
      <Transition appear show={isAddModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsAddModalOpen(false)}>
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                    Add New Email Identity
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-slate-400">
                    Enter an email address to verify. A verification email will be sent to this address.
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleAddEmail();
                    }}
                    className="mt-6 space-y-4"
                  >
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={newEmail}
                        onChange={(e) => {
                          setNewEmail(e.target.value);
                          setEmailError(null);
                          setSubmitMessage(null);
                        }}
                        placeholder="example@domain.com"
                        disabled={isSubmitting}
                        className={`w-full rounded-md border ${
                          emailError ? 'border-rose-500' : 'border-slate-700'
                        } bg-slate-900 px-4 py-2 text-slate-200 placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50 disabled:cursor-not-allowed`}
                        autoFocus
                      />
                      {emailError && (
                        <p className="mt-1 text-sm text-rose-400">{emailError}</p>
                      )}
                    </div>

                    {submitMessage && (
                      <div
                        className={`rounded-md border px-4 py-3 text-sm ${
                          submitMessage.type === 'success'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                        }`}
                      >
                        {submitMessage.text}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddModalOpen(false);
                          setNewEmail('');
                          setEmailError(null);
                          setSubmitMessage(null);
                          setIsSubmitting(false);
                        }}
                        disabled={isSubmitting}
                        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitMessage?.type === 'success' ? 'Close' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || submitMessage?.type === 'success'}
                        className="inline-flex items-center gap-2 bg-brand hover:bg-brand/90 text-brand-foreground px-4 py-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : submitMessage?.type === 'success' ? (
                          'Sent!'
                        ) : (
                          'Send Verification Email'
                        )}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

interface EmailSettings {
  panicModeEnabled: boolean;
  updatedAt: string | null;
}

export default function EmailPage() {
  const [data, setData] = useState<EmailManagementOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'monitoring' | 'security' | 'verified-emails'>('monitoring');
  const [panicMode, setPanicMode] = useState<boolean>(false);
  const [isPanicLoading, setIsPanicLoading] = useState(false);
  const [panicError, setPanicError] = useState<string | null>(null);

  const loadIdentities = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const overview = await apiFetch<EmailManagementOverview>('email/identities');
      setData(overview);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load email identities';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPanicMode = async () => {
    try {
      const settings = await apiFetch<EmailSettings>('email/settings');
      setPanicMode(settings.panicModeEnabled);
    } catch (err) {
      console.error('Failed to load panic mode settings', err);
      // Don't show error to user, just use default
    }
  };

  const togglePanicMode = async () => {
    const newValue = !panicMode;
    const confirmMessage = newValue
      ? 'Are you sure you want to ENABLE panic mode? This will BLOCK all email sending immediately.'
      : 'Are you sure you want to DISABLE panic mode? This will allow email sending to resume.';

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsPanicLoading(true);
    setPanicError(null);
    try {
      const settings = await apiFetch<EmailSettings>('email/settings', {
        method: 'PUT',
        body: JSON.stringify({ panicModeEnabled: newValue }),
      });
      setPanicMode(settings.panicModeEnabled);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update panic mode';
      setPanicError(message);
      setTimeout(() => setPanicError(null), 5000);
    } finally {
      setIsPanicLoading(false);
    }
  };

  useEffect(() => {
    void loadIdentities();
    void loadPanicMode();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-wide text-white">SES Email Overview</h1>
            <p className="text-xs text-slate-400 mt-1">
              Consolidated metrics from AWS SES: sending limits, deliverability, identities, IPs & reputation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Panic Toggle */}
            <div className="relative">
              <button
                onClick={togglePanicMode}
                disabled={isPanicLoading}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
                  panicMode
                    ? 'bg-rose-600 text-white hover:bg-rose-700 border-2 border-rose-500'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border-2 border-slate-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={panicMode ? 'Panic mode: Email sending is BLOCKED' : 'Panic mode: Email sending is enabled'}
              >
                {panicMode ? (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    <span>Panic Mode: ON</span>
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    <span>Panic Mode: OFF</span>
                  </>
                )}
              </button>
              {panicError && (
                <div className="absolute top-full left-0 mt-2 px-3 py-2 rounded-lg bg-rose-500/90 text-white text-xs whitespace-nowrap z-50">
                  {panicError}
                </div>
              )}
            </div>
            <button
              onClick={loadIdentities}
              className="text-xs px-3 py-1 rounded-lg bg-emerald-600 text-slate-950 hover:bg-emerald-500 transition"
            >
              Refresh Data
            </button>
          </div>
        </div>
        {panicMode && (
          <div className="mt-3 px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/40">
            <div className="flex items-center gap-2 text-rose-300 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">PANIC MODE ACTIVE:</span>
              <span>All email sending is currently blocked. Disable panic mode to resume sending.</span>
            </div>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === 'monitoring'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
            }`}
          >
            Monitoring
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === 'security'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
            }`}
          >
            Security & Abuse Protection
          </button>
          <button
            onClick={() => setActiveTab('verified-emails')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
              activeTab === 'verified-emails'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
            }`}
          >
            Verified Emails
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <main className="py-6">
        {activeTab === 'monitoring' ? (
          <MonitoringTab />
        ) : activeTab === 'security' ? (
          <SecurityTab />
        ) : (
          <VerifiedEmailsTab data={data} isLoading={isLoading} error={error} onRefresh={loadIdentities} />
        )}
      </main>
    </div>
  );
}
