"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Plus,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { RefreshControls } from '../../../../components/refresh-controls';

interface SSLCertificate {
  domain: string;
  issuedAt: string;
  expiresAt: string;
  issuer: string;
  status: 'active' | 'expired' | 'pending' | 'renewing' | 'revoked' | 'failed';
  webServer: string;
  managedBy: 'jetcamer' | 'external' | 'unknown';
  acmeEnvironment?: string;
  acmeAccountEmail?: string;
  lastRenewalAttempt?: string;
}

interface SSLCertificateHealth extends SSLCertificate {
  daysToExpiry: number;
}

interface CertificateHealthResponse {
  timestamp: string;
  items: SSLCertificateHealth[];
}

interface ACMEAccount {
  email: string;
  environment: 'production' | 'staging';
  configured: boolean;
}

interface DomainCheck {
  domain: string;
  ips: string[];
  error?: string;
}

const getSelectedInstanceId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const instanceId = localStorage.getItem('hosting-control-panel:selected-ec2-instance');
    if (instanceId && instanceId.trim().length > 0 && instanceId.startsWith('i-')) {
      return instanceId.trim();
    }
    return null;
  } catch {
    return null;
  }
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'active':
      return 'text-emerald-400';
    case 'expired':
      return 'text-red-400';
    case 'pending':
    case 'renewing':
      return 'text-amber-400';
    case 'revoked':
    case 'failed':
      return 'text-slate-400';
    default:
      return 'text-slate-300';
  }
};

const getDaysColor = (days: number): string => {
  if (days <= 0) return 'text-red-400';
  if (days < 15) return 'text-amber-400';
  if (days < 30) return 'text-yellow-400';
  return 'text-emerald-400';
};

export default function SSLPage() {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<SSLCertificateHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardDomain, setWizardDomain] = useState('');
  const [wizardEmail, setWizardEmail] = useState('');
  const [wizardUseStaging, setWizardUseStaging] = useState(false);
  const [domainCheckResult, setDomainCheckResult] = useState<DomainCheck | null>(null);
  const [isCheckingDomain, setIsCheckingDomain] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [issueLogs, setIssueLogs] = useState<string[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [, setAcmeAccount] = useState<ACMEAccount | null>(null);

  // Action states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const instanceId = getSelectedInstanceId();
    setSelectedInstanceId(instanceId);

    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setSelectedInstanceId(newInstanceId);
    };

    window.addEventListener('storage', handleInstanceChange);
    window.addEventListener('ec2-instance-selected', handleInstanceChange);

    return () => {
      window.removeEventListener('storage', handleInstanceChange);
      window.removeEventListener('ec2-instance-selected', handleInstanceChange);
    };
  }, []);

  const loadCertificates = useCallback(async () => {
    if (!selectedInstanceId) {
      setIsLoading(false);
      return;
    }

    try {
      const health = await apiFetch<CertificateHealthResponse>(
        `ssl/health?instanceId=${encodeURIComponent(selectedInstanceId)}`
      );
      const sortedCertificates = (health.items || []).sort((a, b) => a.daysToExpiry - b.daysToExpiry);
      setCertificates(sortedCertificates);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load certificates', err);
      setError(err.message || 'Failed to load certificates');
      setCertificates([]);
    }
  }, [selectedInstanceId]);

  const loadACMEAccount = useCallback(async () => {
    if (!selectedInstanceId) return;

    try {
      const account = await apiFetch<ACMEAccount>(
        `ssl/acme-account?instanceId=${encodeURIComponent(selectedInstanceId)}`
      );
      setAcmeAccount(account);
      if (account.configured && !wizardEmail) {
        setWizardEmail(account.email);
        setWizardUseStaging(account.environment === 'staging');
      }
    } catch (err) {
      console.warn('Failed to load ACME account', err);
      setAcmeAccount(null);
    }
  }, [selectedInstanceId, wizardEmail]);

  const loadAllData = useCallback(async (isRefresh = false) => {
    if (!selectedInstanceId) {
      setIsLoading(false);
      return;
    }

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      await loadCertificates();
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedInstanceId, loadCertificates]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleRefresh = useCallback(async () => {
    await loadAllData(true);
  }, [loadAllData]);

  const checkDomain = async () => {
    if (!wizardDomain.trim() || !selectedInstanceId) return;

    setIsCheckingDomain(true);
    setDomainCheckResult(null);
    try {
      const result = await apiFetch<DomainCheck>(
        `ssl/check-domain?instanceId=${encodeURIComponent(selectedInstanceId)}&domain=${encodeURIComponent(wizardDomain)}`
      );
      setDomainCheckResult(result);
    } catch (err: any) {
      setDomainCheckResult({
        domain: wizardDomain,
        ips: [],
        error: err.message || 'Failed to check domain',
      });
    } finally {
      setIsCheckingDomain(false);
    }
  };

  const configureACME = async () => {
    if (!wizardEmail.trim() || !selectedInstanceId) return;

    try {
      const account = await apiFetch<ACMEAccount>(
        `ssl/acme-account?instanceId=${encodeURIComponent(selectedInstanceId)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: wizardEmail,
            useStaging: wizardUseStaging,
          }),
        }
      );
      setAcmeAccount(account);
      setWizardStep(3);
      setSuccess('ACME account configured successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to configure ACME account');
    }
  };

  const issueCertificate = async () => {
    if (!wizardDomain.trim() || !selectedInstanceId) return;

    setIsIssuing(true);
    setIssueLogs([]);
    const addLog = (msg: string) => {
      setIssueLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    };

    try {
      addLog(`Starting issuance for ${wizardDomain}...`);
      const certificate = await apiFetch<SSLCertificate>(
        `ssl/issue?instanceId=${encodeURIComponent(selectedInstanceId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ domain: wizardDomain }),
        }
      );
      addLog(`Certificate issued successfully. Expires at ${new Date(certificate.expiresAt).toLocaleString()}`);
      setSuccess(`Certificate issued successfully for ${wizardDomain}`);
      setShowWizard(false);
      setWizardStep(1);
      setWizardDomain('');
      await loadAllData(true);
    } catch (err: any) {
      addLog(`Error: ${err.message || 'Failed to issue certificate'}`);
      setError(err.message || 'Failed to issue certificate');
    } finally {
      setIsIssuing(false);
    }
  };

  const handleRenew = async (domain: string) => {
    if (!selectedInstanceId) return;

    setActionLoading((prev) => ({ ...prev, [`renew-${domain}`]: true }));
    setError(null);
    setSuccess(null);

    try {
      await apiFetch(
        `ssl/renew?instanceId=${encodeURIComponent(selectedInstanceId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ domain }),
        }
      );
      setSuccess(`Certificate renewed for ${domain}`);
      await loadAllData(true);
    } catch (err: any) {
      setError(err.message || `Failed to renew certificate for ${domain}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [`renew-${domain}`]: false }));
    }
  };

  const handleRevoke = async (domain: string) => {
    if (!selectedInstanceId) return;
    if (!confirm(`Are you sure you want to revoke the certificate for ${domain}? This action cannot be undone.`)) {
      return;
    }

    setActionLoading((prev) => ({ ...prev, [`revoke-${domain}`]: true }));
    setError(null);
    setSuccess(null);

    try {
      await apiFetch(
        `ssl/revoke?instanceId=${encodeURIComponent(selectedInstanceId)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ domain }),
        }
      );
      setSuccess(`Certificate revoked for ${domain}`);
      await loadAllData(true);
    } catch (err: any) {
      setError(err.message || `Failed to revoke certificate for ${domain}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [`revoke-${domain}`]: false }));
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setWizardDomain('');
    setDomainCheckResult(null);
    setIssueLogs([]);
    setError(null);
    setSuccess(null);
  };

  if (!selectedInstanceId) {
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">SSL Certificates</h1>
          <p className="text-sm text-slate-400">Manage SSL certificates using Let's Encrypt (ACME)</p>
        </header>
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-6 py-8 text-sm text-amber-200">
          Please select an EC2 instance from the dropdown in the top navigation bar to continue.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">SSL Certificates</h1>
          <p className="text-sm text-slate-400 mt-1">Manage SSL certificates using Let's Encrypt (ACME)</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setShowWizard(true);
              resetWizard();
              await loadACMEAccount();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium transition"
          >
            <Plus className="h-4 w-4" />
            New Certificate
          </button>
          <RefreshControls
            onRefresh={handleRefresh}
            autoRefreshEnabled={true}
            refreshInterval={60000}
            isLoading={isRefreshing || isLoading}
          />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-6 py-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-4 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {/* Certificate Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-900">
              <h2 className="text-xl font-semibold text-white">New Certificate Wizard</h2>
              <button
                onClick={() => {
                  setShowWizard(false);
                  resetWizard();
                }}
                disabled={isIssuing}
                className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">

          {/* Step indicators */}
          <ol className="flex items-center text-xs text-slate-400 gap-2">
            <li className={`flex items-center gap-2 ${wizardStep >= 1 ? 'text-sky-400' : ''}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                  wizardStep >= 1 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                1
              </span>
              Domain
            </li>
            <li className={`flex items-center gap-2 ${wizardStep >= 2 ? 'text-sky-400' : ''}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                  wizardStep >= 2 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                2
              </span>
              ACME Account
            </li>
            <li className={`flex items-center gap-2 ${wizardStep >= 3 ? 'text-sky-400' : ''}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                  wizardStep >= 3 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                3
              </span>
              Issue & Install
            </li>
          </ol>

          {/* Step 1: Domain */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Domain name</label>
                <input
                  type="text"
                  value={wizardDomain}
                  onChange={(e) => setWizardDomain(e.target.value)}
                  placeholder="example.com"
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter the hostname that points to this server. We'll run a quick DNS check.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={checkDomain}
                  disabled={!wizardDomain.trim() || isCheckingDomain}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition disabled:opacity-50"
                >
                  {isCheckingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check DNS'}
                </button>
                <button
                  onClick={() => {
                    if (wizardDomain.trim()) {
                      setWizardStep(2);
                      loadACMEAccount();
                    }
                  }}
                  disabled={!wizardDomain.trim()}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold transition disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              {domainCheckResult && (
                <div
                  className={`text-xs ${
                    domainCheckResult.error || domainCheckResult.ips.length === 0
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {domainCheckResult.error
                    ? `DNS lookup failed: ${domainCheckResult.error}`
                    : domainCheckResult.ips.length === 0
                      ? 'No A/AAAA records found'
                      : `Resolved to: ${domainCheckResult.ips.join(', ')}`}
                </div>
              )}
            </div>
          )}

          {/* Step 2: ACME Account */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Contact email for Let's Encrypt</label>
                <input
                  type="email"
                  value={wizardEmail}
                  onChange={(e) => setWizardEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  This email is used for expiry notices and important ACME communication.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={wizardUseStaging}
                  onChange={(e) => setWizardUseStaging(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>
                  Use Let's Encrypt <span className="font-semibold">staging</span> (for testing)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setWizardStep(1)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
                >
                  Back
                </button>
                <button
                  onClick={configureACME}
                  disabled={!wizardEmail.trim()}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold transition disabled:opacity-50"
                >
                  Save & continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Issue */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300 space-y-2">
                <p className="text-slate-200 font-medium">Review & Issue</p>
                <ul className="space-y-1">
                  <li>
                    • Domain: <span className="font-mono text-sky-300">{wizardDomain}</span>
                  </li>
                  <li>
                    • ACME Email: <span className="font-mono text-sky-300">{wizardEmail}</span>
                  </li>
                  <li>
                    • Environment: <span className="font-mono text-sky-300">{wizardUseStaging ? 'staging' : 'production'}</span>
                  </li>
                </ul>
                <p className="text-slate-500 text-[11px]">
                  We'll perform the HTTP-01 challenge, request a certificate from Let's Encrypt, install it on
                  Apache/NGINX and reload the webserver.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setWizardStep(2)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
                >
                  Back
                </button>
                <button
                  onClick={issueCertificate}
                  disabled={isIssuing}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isIssuing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Issuing...
                    </>
                  ) : (
                    'Issue certificate'
                  )}
                </button>
              </div>
              {issueLogs.length > 0 && (
                <div className="mt-2 text-[11px] font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 max-h-52 overflow-auto">
                  {issueLogs.map((log, idx) => (
                    <div key={idx} className="text-slate-300">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            </div>
          </div>
        </div>
      )}

      {/* Certificates Table */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300">Managed Certificates</h2>
          <span className="text-xs text-slate-400">{certificates.length} certificate{certificates.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" />
            <p className="text-sm text-slate-400 mt-2">Loading certificates...</p>
          </div>
        ) : certificates.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No certificates found. Click "New Certificate" to issue your first certificate.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-4 py-3 text-left">Domain</th>
                  <th className="px-4 py-3 text-left">Issuer</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Days</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Managed By</th>
                  <th className="px-4 py-3 text-left">Webserver</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {certificates.map((cert) => {
                  const managedColor =
                    cert.managedBy === 'jetcamer'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : cert.managedBy === 'external'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-500/20 text-slate-200';
                  const isRenewLoading = actionLoading[`renew-${cert.domain}`];
                  const isRevokeLoading = actionLoading[`revoke-${cert.domain}`];

                  return (
                    <tr key={cert.domain} className="hover:bg-slate-900/80">
                      <td className="px-4 py-3 font-medium text-white">{cert.domain}</td>
                      <td className="px-4 py-3 text-slate-400">{cert.issuer || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString() : '—'}
                      </td>
                      <td className={`px-4 py-3 font-medium ${getDaysColor(cert.daysToExpiry)}`}>
                        {cert.daysToExpiry}
                      </td>
                      <td className={`px-4 py-3 ${getStatusColor(cert.status)}`}>{cert.status}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-medium ${managedColor}`}>
                          {cert.managedBy || 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{cert.webServer || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {cert.managedBy === 'jetcamer' ? (
                            <>
                              <button
                                onClick={() => handleRenew(cert.domain)}
                                disabled={isRenewLoading || isRevokeLoading}
                                className="px-2 py-1 rounded bg-sky-600/80 hover:bg-sky-500 text-[11px] transition disabled:opacity-50 flex items-center gap-1"
                                title="Renew certificate"
                              >
                                {isRenewLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCw className="h-3 w-3" />
                                )}
                                Renew
                              </button>
                              <button
                                onClick={() => handleRevoke(cert.domain)}
                                disabled={isRenewLoading || isRevokeLoading}
                                className="px-2 py-1 rounded bg-red-600/80 hover:bg-red-500 text-[11px] transition disabled:opacity-50 flex items-center gap-1"
                                title="Revoke certificate"
                              >
                                {isRevokeLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                Revoke
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">
                              {cert.managedBy === 'external' ? 'External certificate' : 'No actions available'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

