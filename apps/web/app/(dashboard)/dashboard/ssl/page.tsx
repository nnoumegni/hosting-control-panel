"use client";

import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, FileText, Activity, Shield } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { getSelectedInstanceId } from '../../../../lib/instance-utils';
import { RefreshControls } from '../../../../components/refresh-controls';
import { CertificateList } from './_components/certificate-list';
import { CertificateWizard } from './_components/certificate-wizard';
import { AutoRenewalPanel } from './_components/auto-renewal-panel';

interface SSLCertificateHealth {
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
  daysToExpiry: number;
  autoRenewEnabled?: boolean;
  challengeType?: 'http' | 'dns';
  sans?: string[];
}

interface CertificateHealthResponse {
  timestamp: string;
  items: SSLCertificateHealth[];
}

export default function SSLPage() {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<SSLCertificateHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardInitialDomain, setWizardInitialDomain] = useState<string | undefined>(undefined);
  const [wizardInitialPrefixes, setWizardInitialPrefixes] = useState<string[] | undefined>(undefined);
  const [wizardInitialChallengeType, setWizardInitialChallengeType] = useState<'http' | 'dns' | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'certificates' | 'auto-renewal'>('certificates');
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

  const handleRenew = (certificate: SSLCertificateHealth) => {
    if (!selectedInstanceId) return;

    // Extract the base domain (remove www if present)
    const baseDomain = certificate.domain.replace(/^www\./, '');
    
    // Build prefixes list from SANs
    let prefixes: string[] = ['www'];
    if (certificate.sans && certificate.sans.length > 0) {
      // Extract prefixes from SANs
      const extractedPrefixes = certificate.sans
        .map((san) => {
          // Normalize: remove www prefix and base domain suffix
          let normalized = san.replace(/^www\./, '');
          const baseDomainRegex = new RegExp(`\\.${baseDomain.replace(/\./g, '\\.')}$`);
          normalized = normalized.replace(baseDomainRegex, '');
          
          // Handle wildcard (*.example.com -> *)
          if (normalized === '*') {
            return '*';
          }
          
          // If it's a simple subdomain prefix (no dots remaining), return it
          if (normalized && !normalized.includes('.')) {
            return normalized;
          }
          
          return null;
        })
        .filter((p): p is string => p !== null && p !== 'www');
      
      // Combine with www, removing duplicates
      prefixes = Array.from(new Set(['www', ...extractedPrefixes]));
    }

    // Set initial values and open wizard
    setWizardInitialDomain(baseDomain);
    setWizardInitialPrefixes(prefixes);
    setWizardInitialChallengeType(certificate.challengeType || 'http');
    setShowWizard(true);
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

  const handleDownload = async (domain: string, format: 'json' | 'pem' | 'zip') => {
    if (!selectedInstanceId) return;

    setActionLoading((prev) => ({ ...prev, [`download-${domain}`]: true }));
    setError(null);

    try {
      const result = await apiFetch<any>(
        `ssl/download?instanceId=${encodeURIComponent(selectedInstanceId)}&domain=${encodeURIComponent(domain)}&format=${format}`
      );

      if (format === 'json') {
        // Download as JSON file
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${domain}-certificate.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccess(`Certificate downloaded for ${domain}`);
      } else if (format === 'zip') {
        // For ZIP, the API should return a blob
        setSuccess(`Certificate download initiated for ${domain}`);
      } else {
        // For PEM, format and download
        const pemContent = `-----BEGIN CERTIFICATE-----\n${result.certificate}\n-----END CERTIFICATE-----\n-----BEGIN PRIVATE KEY-----\n${result.privateKey}\n-----END PRIVATE KEY-----\n`;
        const blob = new Blob([pemContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${domain}-certificate.pem`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccess(`Certificate downloaded for ${domain}`);
      }
    } catch (err: any) {
      setError(err.message || `Failed to download certificate for ${domain}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [`download-${domain}`]: false }));
    }
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
            onClick={() => {
              setWizardInitialDomain(undefined);
              setWizardInitialPrefixes(undefined);
              setWizardInitialChallengeType(undefined);
              setShowWizard(true);
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

      {/* Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/50 rounded-t-xl">
        <nav className="flex space-x-6 px-6">
          <button
            onClick={() => setActiveTab('certificates')}
            className={`py-3 border-b-2 transition ${
              activeTab === 'certificates'
                ? 'border-emerald-600 font-medium text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Certificates
            </div>
          </button>
          <button
            onClick={() => setActiveTab('auto-renewal')}
            className={`py-3 border-b-2 transition ${
              activeTab === 'auto-renewal'
                ? 'border-emerald-600 font-medium text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Auto-Renewal
            </div>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-slate-900/60 rounded-b-xl border border-slate-800 border-t-0 overflow-hidden">
        {activeTab === 'certificates' && (
          <div className="p-6">
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300">Managed Certificates</h2>
                <span className="text-xs text-slate-400">
                  {certificates.length} certificate{certificates.length !== 1 ? 's' : ''}
                </span>
              </div>
              <CertificateList
                certificates={certificates}
                isLoading={isLoading}
                actionLoading={actionLoading}
                instanceId={selectedInstanceId}
                onRenew={(domain) => {
                  const cert = certificates.find((c) => c.domain === domain);
                  if (cert) {
                    void handleRenew(cert);
                  }
                }}
                onRevoke={handleRevoke}
                onDownload={handleDownload}
              />
            </div>
          </div>
        )}

        {activeTab === 'auto-renewal' && (
          <div className="p-6">
            <AutoRenewalPanel instanceId={selectedInstanceId} />
          </div>
        )}
      </div>

      {/* Certificate Wizard */}
      {showWizard && (
        <CertificateWizard
          isOpen={showWizard}
          onClose={() => {
            setShowWizard(false);
            setWizardInitialDomain(undefined);
            setWizardInitialPrefixes(undefined);
            setWizardInitialChallengeType(undefined);
          }}
          onSuccess={() => {
            setShowWizard(false);
            setWizardInitialDomain(undefined);
            setWizardInitialPrefixes(undefined);
            setWizardInitialChallengeType(undefined);
            void loadAllData(true);
          }}
          instanceId={selectedInstanceId}
          initialDomain={wizardInitialDomain}
          initialPrefixes={wizardInitialPrefixes}
          initialChallengeType={wizardInitialChallengeType}
        />
      )}
    </div>
  );
}
