"use client";

import { Loader2, RotateCw, Trash2, Download, AlertTriangle } from 'lucide-react';

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

interface CertificateListProps {
  certificates: SSLCertificateHealth[];
  isLoading: boolean;
  actionLoading: Record<string, boolean>;
  instanceId: string;
  onRenew: (domain: string) => void;
  onRevoke: (domain: string) => Promise<void>;
  onDownload: (domain: string, format: 'json' | 'pem' | 'zip') => Promise<void>;
}

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

export function CertificateList({
  certificates,
  isLoading,
  actionLoading,
  instanceId,
  onRenew,
  onRevoke,
  onDownload,
}: CertificateListProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" />
        <p className="text-sm text-slate-400 mt-2">Loading certificates...</p>
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-slate-500" />
        <p>No certificates found. Click "New Certificate" to issue your first certificate.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <th className="px-4 py-3 text-left">Domain</th>
            <th className="px-4 py-3 text-left">Issuer</th>
            <th className="px-4 py-3 text-left">Issued</th>
            <th className="px-4 py-3 text-left">Expires</th>
            <th className="px-4 py-3 text-left">Days Left</th>
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
            const isDownloadLoading = actionLoading[`download-${cert.domain}`];

            return (
              <tr key={cert.domain} className="hover:bg-slate-900/80">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{cert.domain}</div>
                        {cert.sans && cert.sans.length > 0 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            +{cert.sans.length} more: {cert.sans.slice(0, 2).join(', ')}
                            {cert.sans.length > 2 && ` +${cert.sans.length - 2}`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{cert.issuer || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString() : '—'}
                      </td>
                      <td className={`px-4 py-3 font-medium ${getDaysColor(cert.daysToExpiry)}`}>
                        {cert.daysToExpiry}
                      </td>
                      <td className="px-4 py-3">
                        <div className={`${getStatusColor(cert.status)}`}>{cert.status}</div>
                        {cert.autoRenewEnabled !== undefined && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {cert.autoRenewEnabled ? '🔄 Auto-renew' : '⏸️ Manual'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-medium ${managedColor}`}>
                          {cert.managedBy || 'unknown'}
                        </span>
                        {cert.challengeType && (
                          <div className="text-[10px] text-slate-500 mt-1">
                            {cert.challengeType === 'dns' ? 'DNS-01' : 'HTTP-01'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{cert.webServer || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDownload(cert.domain, 'json')}
                      disabled={isDownloadLoading}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors disabled:opacity-50"
                      title="Download certificate"
                    >
                      {isDownloadLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={() => onRenew(cert.domain)}
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
                      onClick={() => onRevoke(cert.domain)}
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
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

