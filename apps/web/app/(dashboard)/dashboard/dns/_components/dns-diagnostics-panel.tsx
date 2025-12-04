"use client";

import { useState } from 'react';
import { Loader2, Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Mail, Server, Link2, Globe } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';

interface DNSRecord {
  type: string;
  value: string;
  priority?: number;
  ttl?: number;
}

interface DNSDiagnostics {
  domain: string;
  records: Record<string, DNSRecord[]>;
  timestamp: string;
  summary: {
    hasA: boolean;
    hasAAAA: boolean;
    hasMX: boolean;
    hasNS: boolean;
    hasTXT: boolean;
    hasCNAME: boolean;
  };
}

interface DNSDiagnosticsPanelProps {
  instanceId: string;
}

const RECORD_TYPE_INFO: Record<string, { icon: typeof Globe; label: string; color: string }> = {
  A: { icon: Globe, label: 'A Records (IPv4)', color: 'text-blue-400' },
  AAAA: { icon: Globe, label: 'AAAA Records (IPv6)', color: 'text-cyan-400' },
  CNAME: { icon: Link2, label: 'CNAME Records', color: 'text-purple-400' },
  MX: { icon: Mail, label: 'MX Records', color: 'text-emerald-400' },
  NS: { icon: Server, label: 'NS Records', color: 'text-amber-400' },
  TXT: { icon: Activity, label: 'TXT Records', color: 'text-rose-400' },
};

export function DNSDiagnosticsPanel({ instanceId }: DNSDiagnosticsPanelProps) {
  const [hostname, setHostname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DNSDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDiagnostics = async () => {
    if (!hostname.trim()) {
      setError('Please enter a hostname');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDiagnostics(null);

    try {
      const response = await apiFetch<DNSDiagnostics>(
        `dns/diagnostics?hostname=${encodeURIComponent(hostname.trim())}&instanceId=${encodeURIComponent(instanceId)}`
      );
      setDiagnostics(response);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to get DNS diagnostics';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const formatRecordValue = (record: DNSRecord): string => {
    if (record.priority !== undefined) {
      return `${record.priority} ${record.value}`;
    }
    return record.value;
  };

  return (
    <div className="space-y-6">
      {/* Diagnostics Form */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">DNS Diagnostics</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="diagnostics-hostname" className="block text-sm font-medium text-slate-300 mb-2">
              Hostname / Domain
            </label>
            <input
              id="diagnostics-hostname"
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleDiagnostics();
                }
              }}
              placeholder="example.com"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleDiagnostics}
              disabled={isLoading || !hostname.trim()}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4" />
                  Run Diagnostics
                </>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Comprehensive DNS analysis for A, AAAA, CNAME, MX, NS, and TXT records
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-200">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Diagnostics Failed</p>
              <p className="text-rose-300/80 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {diagnostics && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-400" />
              DNS Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(diagnostics.summary).map(([key, value]) => {
                const recordType = key.replace('has', '').toUpperCase();
                const info = RECORD_TYPE_INFO[recordType];
                const Icon = info?.icon || Globe;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      value
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    {value ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-slate-500 flex-shrink-0" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-white">{info?.label || recordType}</div>
                      <div className="text-xs text-slate-400">
                        {value ? 'Configured' : 'Not found'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
              Analyzed at: {new Date(diagnostics.timestamp).toLocaleString()}
            </div>
          </div>

          {/* Detailed Records */}
          {Object.keys(diagnostics.records).length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Record Details</h3>
              {Object.entries(diagnostics.records).map(([recordType, records]) => {
                const info = RECORD_TYPE_INFO[recordType];
                const Icon = info?.icon || Globe;
                return (
                  <div key={recordType} className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Icon className={`h-5 w-5 ${info?.color || 'text-slate-400'}`} />
                      <h4 className="text-md font-semibold text-white">{info?.label || recordType}</h4>
                      <span className="px-2 py-1 bg-slate-800 text-slate-400 text-xs rounded">
                        {records.length} {records.length === 1 ? 'record' : 'records'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {records.map((record, index) => (
                        <div
                          key={index}
                          className="bg-slate-800/60 rounded-lg border border-slate-700 p-4"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            {record.priority !== undefined && (
                              <span className="text-xs text-slate-400">Priority: {record.priority}</span>
                            )}
                            {record.ttl && (
                              <span className="text-xs text-slate-400">TTL: {record.ttl}s</span>
                            )}
                          </div>
                          <div className="font-mono text-sm text-slate-200 break-all">
                            {formatRecordValue(record)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {Object.keys(diagnostics.records).length === 0 && (
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-8 text-center text-slate-400">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-slate-500" />
              <p>No DNS records found for {diagnostics.domain}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

