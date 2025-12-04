"use client";

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Mail, CheckCircle2, XCircle, AlertTriangle, Plus, Settings, Users, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { useDomains, type Domain } from '../../../../hooks/use-domains';

interface MailProvider {
  _id: string;
  domainId: string;
  providerType: 'GOOGLE_WORKSPACE' | 'MICROSOFT_365';
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING';
  config: {
    google?: { delegatedAdmin: string };
    microsoft365?: { tenantId: string; clientId: string };
  };
  updatedAt: string;
  createdAt: string;
}

interface DnsStatus {
  _id: string;
  domainId: string;
  mxValid: boolean;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  overallStatus: 'PASS' | 'WARN' | 'FAIL';
  lastCheckedAt: string;
}

interface ProviderDetectionResult {
  provider: 'GOOGLE_WORKSPACE' | 'MICROSOFT_365' | 'NO_PROVIDER' | 'MIXED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  details: {
    mxRecords?: string[];
    spfRecord?: string;
    dkimRecords?: string[];
    autodiscover?: boolean;
    verificationTxt?: string[];
  };
}

export default function EmailProvidersPage() {
  // Use shared hook for domain management
  const { domains, isLoading: isLoadingDomains, error: domainsError, refreshDomains } = useDomains({
    deduplicate: true,
    autoLoad: true,
  });

  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [provider, setProvider] = useState<MailProvider | null>(null);
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null);
  const [detection, setDetection] = useState<ProviderDetectionResult | null>(null);
  const [isLoadingDetection, setIsLoadingDetection] = useState(false);
  const [isLoadingDns, setIsLoadingDns] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configType, setConfigType] = useState<'GOOGLE_WORKSPACE' | 'MICROSOFT_365' | null>(null);
  const [defaultCredentials, setDefaultCredentials] = useState<{
    hasGoogleDefaults: boolean;
    hasMicrosoft365Defaults: boolean;
  } | null>(null);
  const [isAutoConfiguring, setIsAutoConfiguring] = useState(false);
  const [activeTab, setActiveTab] = useState<'detection' | 'configuration' | 'dns'>('detection');

  // Set first domain as selected when domains load
  useEffect(() => {
    if (domains.length > 0 && !selectedDomain) {
      setSelectedDomain(domains[0]);
    }
  }, [domains, selectedDomain]);

  const loadProvider = async (domainId: string) => {
    try {
      const provider = await apiFetch<MailProvider>(`providers/domains/${domainId}/provider`);
      setProvider(provider);
    } catch (err) {
      // Provider not configured is not an error
      if (err instanceof Error && !err.message.includes('404') && !err.message.includes('No provider')) {
        console.error('Failed to load provider', err);
      }
      setProvider(null);
    }
  };

  const loadDefaultCredentials = async () => {
    try {
      const info = await apiFetch<{ hasGoogleDefaults: boolean; hasMicrosoft365Defaults: boolean }>(
        'providers/defaults',
      );
      setDefaultCredentials(info);
    } catch (err) {
      console.error('Failed to load default credentials info', err);
      setDefaultCredentials({ hasGoogleDefaults: false, hasMicrosoft365Defaults: false });
    }
  };

  const autoConfigureProvider = useCallback(
    async (domainId: string, providerType: 'GOOGLE_WORKSPACE' | 'MICROSOFT_365') => {
      try {
        setIsAutoConfiguring(true);
        const provider = await apiFetch<MailProvider>(`providers/domains/${domainId}/auto-configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerType }),
        });
        setProvider(provider);
        // Reload DNS status after auto-configuration
        await loadDnsStatus(domainId);
      } catch (err) {
        console.error('Failed to auto-configure provider', err);
        setError(err instanceof Error ? err.message : 'Failed to auto-configure provider');
      } finally {
        setIsAutoConfiguring(false);
      }
    },
    [],
  );

  const loadDnsStatus = async (domainId: string) => {
    try {
      setIsLoadingDns(true);
      const status = await apiFetch<DnsStatus & { details?: any }>(`providers/domains/${domainId}/dns/status`);
      setDnsStatus(status);
    } catch (err) {
      console.error('Failed to load DNS status', err);
      setDnsStatus(null);
    } finally {
      setIsLoadingDns(false);
    }
  };

  const detectProvider = async (domainId: string) => {
    try {
      setIsLoadingDetection(true);
      const result = await apiFetch<ProviderDetectionResult>(`providers/domains/${domainId}/detect`);
      setDetection(result);
    } catch (err) {
      console.error('Failed to detect provider', err);
      setDetection(null);
    } finally {
      setIsLoadingDetection(false);
    }
  };

  useEffect(() => {
    void loadDefaultCredentials();
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      void loadProvider(selectedDomain._id);
      void loadDnsStatus(selectedDomain._id);
      void detectProvider(selectedDomain._id);
    }
  }, [selectedDomain]);

  // Auto-configure provider if defaults are available and no provider is configured
  useEffect(() => {
    if (selectedDomain && !provider && defaultCredentials && !isAutoConfiguring) {
      // Try to auto-configure based on detection or defaults
      if (detection) {
        if (detection.provider === 'GOOGLE_WORKSPACE' && defaultCredentials.hasGoogleDefaults) {
          void autoConfigureProvider(selectedDomain._id, 'GOOGLE_WORKSPACE');
        } else if (detection.provider === 'MICROSOFT_365' && defaultCredentials.hasMicrosoft365Defaults) {
          void autoConfigureProvider(selectedDomain._id, 'MICROSOFT_365');
        }
      }
    }
  }, [selectedDomain, provider, defaultCredentials, detection, isAutoConfiguring, autoConfigureProvider]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'PASS':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40';
      case 'WARN':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/40';
      case 'ERROR':
      case 'FAIL':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/40';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/40';
    }
  };

  const getProviderName = (type: string) => {
    switch (type) {
      case 'GOOGLE_WORKSPACE':
        return 'Google Workspace';
      case 'MICROSOFT_365':
        return 'Microsoft 365';
      default:
        return type;
    }
  };

  if (isLoadingDomains) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">Email Provider Integration</h1>
          <p className="text-sm text-slate-400">Connect and manage Google Workspace and Microsoft 365</p>
        </header>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Email Provider Integration</h1>
        <p className="text-sm text-slate-400">Connect and manage Google Workspace and Microsoft 365 for your domains</p>
      </header>

      {domainsError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-200">
          {domainsError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Domain Sidebar */}
        <aside className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase mb-4">Domains</h2>
          {domains.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-sm">
              <p>No domains found.</p>
              <p className="text-xs mt-1">Add a domain first to configure email providers.</p>
            </div>
          ) : (
            <ul className="space-y-1 max-h-[400px] overflow-auto">
              {domains.map((domain) => (
                <li
                  key={domain._id}
                  onClick={() => setSelectedDomain(domain)}
                  className={`px-2 py-2 rounded-md hover:bg-slate-800 cursor-pointer transition text-sm ${
                    selectedDomain?._id === domain._id
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-300'
                  }`}
                >
                  {domain.domain}
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main Panel */}
        <main className="flex flex-col bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between p-4 bg-slate-900/80 border-b border-slate-800">
            <h2 className="text-lg font-semibold text-white">
              {selectedDomain?.domain ?? 'Select a domain'}
            </h2>
          </header>

          {selectedDomain ? (
            <>
              {/* Tabs */}
              <div className="border-b border-slate-800 bg-slate-900/50">
                <nav className="flex space-x-6 px-6">
                  <button
                    onClick={() => setActiveTab('detection')}
                    className={`py-3 border-b-2 transition ${
                      activeTab === 'detection'
                        ? 'border-emerald-600 font-medium text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    Provider Detection
                  </button>
                  <button
                    onClick={() => setActiveTab('configuration')}
                    className={`py-3 border-b-2 transition ${
                      activeTab === 'configuration'
                        ? 'border-emerald-600 font-medium text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    Configuration
                  </button>
                  <button
                    onClick={() => setActiveTab('dns')}
                    className={`py-3 border-b-2 transition ${
                      activeTab === 'dns'
                        ? 'border-emerald-600 font-medium text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    DNS Status
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <section className="p-6 overflow-y-auto flex-1">
                {activeTab === 'detection' && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">Provider Detection</h3>
                        <button
                          onClick={() => void detectProvider(selectedDomain._id)}
                          disabled={isLoadingDetection}
                          className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                        >
                          {isLoadingDetection ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4" />
                              Re-detect
                            </span>
                          )}
                        </button>
                      </div>
                      {isLoadingDetection ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                      ) : detection ? (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">Detected Provider:</span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(detection.provider)}`}>
                              {detection.provider === 'NO_PROVIDER'
                                ? 'No Provider'
                                : detection.provider === 'MIXED'
                                  ? 'Mixed Configuration'
                                  : getProviderName(detection.provider)}
                            </span>
                            <span className="text-xs text-slate-500">({detection.confidence} confidence)</span>
                          </div>
                          {detection.details.mxRecords && detection.details.mxRecords.length > 0 && (
                            <div className="text-sm">
                              <span className="text-slate-400">MX Records:</span>
                              <ul className="mt-2 ml-4 space-y-1 text-slate-300">
                                {detection.details.mxRecords.map((mx, i) => (
                                  <li key={i} className="font-mono text-xs">{mx}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
                          No provider detected
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'configuration' && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">Provider Configuration</h3>
                        {!provider && (
                          <div className="flex gap-2">
                            {defaultCredentials?.hasGoogleDefaults ? (
                              <button
                                onClick={() => void autoConfigureProvider(selectedDomain._id, 'GOOGLE_WORKSPACE')}
                                disabled={isAutoConfiguring}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition disabled:opacity-50"
                              >
                                {isAutoConfiguring ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                                Google Workspace (Auto)
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setConfigType('GOOGLE_WORKSPACE');
                                  setShowConfigModal(true);
                                }}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition"
                              >
                                <Plus className="h-4 w-4" />
                                Google Workspace
                              </button>
                            )}
                            {defaultCredentials?.hasMicrosoft365Defaults ? (
                              <button
                                onClick={() => void autoConfigureProvider(selectedDomain._id, 'MICROSOFT_365')}
                                disabled={isAutoConfiguring}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm transition disabled:opacity-50"
                              >
                                {isAutoConfiguring ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                                Microsoft 365 (Auto)
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setConfigType('MICROSOFT_365');
                                  setShowConfigModal(true);
                                }}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm transition"
                              >
                                <Plus className="h-4 w-4" />
                                Microsoft 365
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {provider ? (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">Provider:</span>
                            <span className="text-white font-medium">{getProviderName(provider.providerType)}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(provider.status)}`}>
                              {provider.status}
                            </span>
                          </div>
                          {provider.config.google && (
                            <div className="text-sm">
                              <span className="text-slate-400">Delegated Admin:</span>
                              <span className="ml-2 text-slate-200">{provider.config.google.delegatedAdmin}</span>
                            </div>
                          )}
                          {provider.config.microsoft365 && (
                            <div className="text-sm space-y-1">
                              <div>
                                <span className="text-slate-400">Tenant ID:</span>
                                <span className="ml-2 text-slate-200 font-mono text-xs">{provider.config.microsoft365.tenantId}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">Client ID:</span>
                                <span className="ml-2 text-slate-200 font-mono text-xs">{provider.config.microsoft365.clientId}</span>
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            <button className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300">
                              <Settings className="h-4 w-4" />
                              Manage Users
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
                          No provider configured. Click the buttons above to connect Google Workspace or Microsoft 365.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'dns' && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">DNS Validation Status</h3>
                        <button
                          onClick={() => void loadDnsStatus(selectedDomain._id)}
                          disabled={isLoadingDns}
                          className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                        >
                          {isLoadingDns ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4" />
                              Refresh
                            </span>
                          )}
                        </button>
                      </div>
                      {isLoadingDns ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                      ) : dnsStatus ? (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">Overall Status:</span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(dnsStatus.overallStatus)}`}>
                              {dnsStatus.overallStatus}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                              {dnsStatus.mxValid ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                              ) : (
                                <XCircle className="h-5 w-5 text-rose-400" />
                              )}
                              <span className="text-sm text-slate-300">MX Records</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {dnsStatus.spfValid ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                              ) : (
                                <XCircle className="h-5 w-5 text-rose-400" />
                              )}
                              <span className="text-sm text-slate-300">SPF</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {dnsStatus.dkimValid ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                              ) : (
                                <XCircle className="h-5 w-5 text-rose-400" />
                              )}
                              <span className="text-sm text-slate-300">DKIM</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {dnsStatus.dmarcValid ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                              ) : (
                                <XCircle className="h-5 w-5 text-rose-400" />
                              )}
                              <span className="text-sm text-slate-300">DMARC</span>
                            </div>
                          </div>
                          {dnsStatus.overallStatus !== 'PASS' && (
                            <div className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/40 text-sm text-amber-200">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-medium mb-1">DNS Configuration Issues Detected</p>
                                  <p className="text-xs text-amber-300/80">
                                    Some DNS records are missing or incorrect. Click "Fix DNS" to automatically configure the required records.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
                          No DNS status available. Configure a provider first.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400">
              <Mail className="h-12 w-12 mx-auto mb-4 text-slate-500" />
              <p>Select a domain from the sidebar to configure email provider integration</p>
            </div>
          )}
        </main>
      </div>

      {/* Configuration Modal - Placeholder for now */}
      {showConfigModal && configType && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">
              Configure {getProviderName(configType)}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Configuration form will be implemented here. For now, use the API endpoints directly.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  setConfigType(null);
                }}
                className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

