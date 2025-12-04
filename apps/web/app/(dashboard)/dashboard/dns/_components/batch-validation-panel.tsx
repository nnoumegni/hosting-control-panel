"use client";

import { useState } from 'react';
import { Loader2, FileText, CheckCircle2, XCircle, AlertTriangle, Copy, Trash2, Plus } from 'lucide-react';
import { useDNSLookup, type DNSRecordType, type DNSRecord } from '../../../../../hooks/use-dns-lookup';

interface ValidationResult {
  domain: string;
  status: 'ok' | 'failed';
  records?: DNSRecord[];
  error?: string;
  recordType?: string;
}

interface BatchValidationPanelProps {
  instanceId: string;
}

export function BatchValidationPanel({ instanceId }: BatchValidationPanelProps) {
  const [domains, setDomains] = useState<string>('');
  const [recordType, setRecordType] = useState<DNSRecordType>('A');
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [copied, setCopied] = useState(false);
  
  const { lookup } = useDNSLookup({ instanceId });

  const handleValidation = async () => {
    const domainList = domains
      .split('\n')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    if (domainList.length === 0) {
      return;
    }

    setIsValidating(true);
    setResults([]);

    const validationResults: ValidationResult[] = [];

    for (const domain of domainList) {
      try {
        const response = await lookup(domain, recordType);
        validationResults.push({
          domain,
          status: 'ok',
          records: response.records,
          recordType: response.recordType,
        });
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to resolve';
        validationResults.push({
          domain,
          status: 'failed',
          error: errorMessage,
          recordType,
        });
      }
    }

    setResults(validationResults);
    setIsValidating(false);
  };

  const copyResults = () => {
    const text = results
      .map((r) => {
        if (r.status === 'ok') {
          const values = r.records?.map((rec) => rec.value).join(', ') || 'No records';
          return `✓ ${r.domain}: ${values}`;
        } else {
          return `✗ ${r.domain}: ${r.error}`;
        }
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearResults = () => {
    setResults([]);
    setDomains('');
  };

  const successCount = results.filter((r) => r.status === 'ok').length;
  const failureCount = results.filter((r) => r.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Validation Form */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Batch Domain Validation</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="domains" className="block text-sm font-medium text-slate-300 mb-2">
              Domains (one per line)
            </label>
            <textarea
              id="domains"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="example.com&#10;www.example.com&#10;app.example.com"
              rows={6}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label htmlFor="batch-recordType" className="block text-sm font-medium text-slate-300 mb-2">
                Record Type
              </label>
              <select
                id="batch-recordType"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value as any)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="A">A (IPv4)</option>
                <option value="AAAA">AAAA (IPv6)</option>
                <option value="MX">MX (Mail)</option>
                <option value="NS">NS (Nameservers)</option>
                <option value="TXT">TXT (Text)</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleValidation}
                disabled={isValidating || !domains.trim()}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Validate
                  </>
                )}
              </button>
              {results.length > 0 && (
                <>
                  <button
                    onClick={copyResults}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition flex items-center gap-2"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={clearResults}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md transition flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      {results.length > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Validation Results</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">{successCount} successful</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-400" />
                <span className="text-rose-400">{failureCount} failed</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  result.status === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-rose-500/10 border-rose-500/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {result.status === 'ok' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />
                      )}
                      <span className="font-medium text-white">{result.domain}</span>
                      {result.recordType && (
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded">
                          {result.recordType}
                        </span>
                      )}
                    </div>
                    {result.status === 'ok' && result.records && result.records.length > 0 ? (
                      <div className="ml-7 space-y-1">
                        {result.records.map((record, recIndex) => (
                          <div key={recIndex} className="font-mono text-sm text-slate-200">
                            {record.value}
                            {record.priority !== undefined && (
                              <span className="text-slate-400 ml-2">(priority: {record.priority})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : result.status === 'failed' ? (
                      <div className="ml-7 text-sm text-rose-300">{result.error}</div>
                    ) : (
                      <div className="ml-7 text-sm text-slate-400">No records found</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

