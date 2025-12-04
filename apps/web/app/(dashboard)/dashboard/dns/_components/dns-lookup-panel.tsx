"use client";

import { useState, useEffect, useRef } from 'react';
import { Loader2, Search, Copy, CheckCircle2, XCircle, Globe, Mail, Server, Link2, Activity, Filter } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';
import { isValidDomainName, isTopLevelDomain } from '../../../../../lib/domain-validation';
import type { DNSRecord } from '../../../../../hooks/use-dns-lookup';

type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA' | 'SRV' | 'PTR';

interface DNSLookupResult {
  recordType: DNSRecordType;
  records: DNSRecord[];
  count: number;
  cachedFrom?: string;
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

interface DNSLookupPanelProps {
  instanceId: string;
  initialHostname?: string;
  onLookupComplete?: (domain: string) => void;
  onLookupResults?: (hasRecords: boolean, domain: string) => void; // Callback with lookup results
  showDetailsByDefault?: boolean;
  hideSearchForm?: boolean;
  autoLookup?: boolean;
  triggerLookup?: string; // When this changes, trigger a lookup
  onBuyDomain?: (domain: string) => void; // Callback for "Buy this domain" button
  managedDomains?: string[]; // List of managed domains to check availability
}

const RECORD_TYPE_OPTIONS: { value: DNSRecordType; label: string; description: string; icon: typeof Globe; color: string }[] = [
  { value: 'A', label: 'A (IPv4)', description: 'IPv4 address records', icon: Globe, color: 'text-blue-400' },
  { value: 'AAAA', label: 'AAAA (IPv6)', description: 'IPv6 address records', icon: Globe, color: 'text-cyan-400' },
  { value: 'CNAME', label: 'CNAME', description: 'Canonical name (alias)', icon: Link2, color: 'text-purple-400' },
  { value: 'MX', label: 'MX', description: 'Mail exchange servers', icon: Mail, color: 'text-emerald-400' },
  { value: 'NS', label: 'NS', description: 'Nameservers', icon: Server, color: 'text-amber-400' },
  { value: 'TXT', label: 'TXT', description: 'Text records (SPF, DKIM, etc.)', icon: Activity, color: 'text-rose-400' },
  { value: 'SOA', label: 'SOA', description: 'Start of authority', icon: Globe, color: 'text-slate-400' },
  { value: 'SRV', label: 'SRV', description: 'Service records', icon: Globe, color: 'text-indigo-400' },
  { value: 'PTR', label: 'PTR', description: 'Reverse DNS', icon: Globe, color: 'text-pink-400' },
];

export function DNSLookupPanel({ instanceId, initialHostname, onLookupComplete, onLookupResults, showDetailsByDefault = true, hideSearchForm = false, autoLookup = false, triggerLookup, onBuyDomain, managedDomains = [] }: DNSLookupPanelProps) {
  const [hostname, setHostname] = useState(initialHostname || '');
  
  // Update hostname when initialHostname changes
  useEffect(() => {
    if (initialHostname) {
      setHostname(initialHostname);
    }
  }, [initialHostname]);
  const [selectedTypes, setSelectedTypes] = useState<Set<DNSRecordType>>(new Set(RECORD_TYPE_OPTIONS.map(opt => opt.value)));
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Map<DNSRecordType, DNSLookupResult>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(showDetailsByDefault);
  const lastLookupRef = useRef<string | null>(null);

  const handleLookup = async () => {
    if (!hostname.trim()) {
      setError('Please enter a hostname');
      return;
    }

    // Validate domain name before performing lookup
    if (!isValidDomainName(hostname.trim())) {
      setError('Please enter a valid domain name');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(new Map());

    try {
      // Use diagnostics endpoint to get all record types at once
      const diagnostics = await apiFetch<DNSDiagnostics>(
        `dns/diagnostics?hostname=${encodeURIComponent(hostname.trim())}&instanceId=${encodeURIComponent(instanceId)}`
      );

      // Convert diagnostics to lookup results format
      const newResults = new Map<DNSRecordType, DNSLookupResult>();
      Object.entries(diagnostics.records).forEach(([type, records]) => {
        if (records && records.length > 0) {
          newResults.set(type as DNSRecordType, {
            recordType: type as DNSRecordType,
            records,
            count: records.length,
          });
        }
      });

      setResults(newResults);
      // Always show details when results are available (user just performed a lookup)
      setShowDetails(true);
      
      // Notify parent component of lookup completion
      if (onLookupComplete) {
        onLookupComplete(hostname.trim());
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to perform DNS lookup';
      setError(errorMessage);
      setResults(new Map());
    } finally {
      setIsLoading(false);
    }
  };
  
  // Trigger lookup when triggerLookup prop changes
  useEffect(() => {
    if (!triggerLookup || !triggerLookup.trim()) {
      return;
    }

    const lookupHostname = triggerLookup.trim();
    
    // Prevent re-triggering if we're already loading the same domain
    if (isLoading && lastLookupRef.current === lookupHostname) {
      return;
    }
    
    // Validate domain name before performing lookup
    if (!isValidDomainName(lookupHostname)) {
      setError('Please enter a valid domain name');
      setResults(new Map());
      setShowDetails(false);
      return;
    }
    
    // Mark this domain as being looked up
    lastLookupRef.current = lookupHostname;
    setHostname(lookupHostname);
    setIsLoading(true);
    setError(null);
    setResults(new Map());
    
    // Perform the lookup
    const performLookup = async () => {
      try {
        // Use diagnostics endpoint to get all record types at once
        const diagnostics = await apiFetch<DNSDiagnostics>(
          `dns/diagnostics?hostname=${encodeURIComponent(lookupHostname)}&instanceId=${encodeURIComponent(instanceId)}`
        );

        // Convert diagnostics to lookup results format
        const newResults = new Map<DNSRecordType, DNSLookupResult>();
        
        // Check if diagnostics.records exists and is an object
        if (diagnostics && diagnostics.records && typeof diagnostics.records === 'object') {
          Object.entries(diagnostics.records).forEach(([type, records]) => {
            if (records && Array.isArray(records) && records.length > 0) {
              newResults.set(type as DNSRecordType, {
                recordType: type as DNSRecordType,
                records,
                count: records.length,
              });
            }
          });
        }

        // Only update if this is still the current lookup
        if (lastLookupRef.current === lookupHostname) {
          setResults(newResults);
          setShowDetails(true);
          
          // Notify parent component of lookup completion (only if still the current lookup)
          if (onLookupComplete) {
            onLookupComplete(lookupHostname);
          }
          // Notify parent about lookup results (hasRecords, domain)
          if (onLookupResults) {
            const hasRecords = newResults.size > 0;
            onLookupResults(hasRecords, lookupHostname);
          }
        }
      } catch (err: any) {
        // Only update error if this is still the current lookup
        if (lastLookupRef.current === lookupHostname) {
          const errorMessage = err?.response?.data?.error || err?.message || 'Failed to perform DNS lookup';
          setError(errorMessage);
          setResults(new Map());
          setShowDetails(false);
          
          // Notify parent that lookup completed with error (no records found)
          if (onLookupResults) {
            onLookupResults(false, lookupHostname);
          }
        }
      } finally {
        // Only update loading state if this is still the current lookup
        if (lastLookupRef.current === lookupHostname) {
          setIsLoading(false);
        }
      }
    };
    
    // Small delay to ensure state is stable
    const timeoutId = setTimeout(performLookup, 100);
    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerLookup, instanceId]);

  const toggleRecordType = (type: DNSRecordType) => {
    const newSelected = new Set(selectedTypes);
    if (newSelected.has(type)) {
      newSelected.delete(type);
    } else {
      newSelected.add(type);
    }
    setSelectedTypes(newSelected);
  };

  const selectAll = () => {
    setSelectedTypes(new Set(RECORD_TYPE_OPTIONS.map(opt => opt.value)));
  };

  const deselectAll = () => {
    setSelectedTypes(new Set());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatRecordValue = (record: DNSRecord): string => {
    if (record.priority !== undefined) {
      return `${record.priority} ${record.value}`;
    }
    return record.value;
  };

  const visibleResults = Array.from(results.entries())
    .filter(([type]) => selectedTypes.has(type))
    .sort(([a], [b]) => {
      const indexA = RECORD_TYPE_OPTIONS.findIndex(opt => opt.value === a);
      const indexB = RECORD_TYPE_OPTIONS.findIndex(opt => opt.value === b);
      return indexA - indexB;
    });

  return (
    <div className="space-y-6">
      {/* Lookup Form */}
      {!hideSearchForm && (
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">DNS Lookup</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label htmlFor="hostname" className="block text-sm font-medium text-slate-300 mb-2">
              Hostname / Domain
            </label>
            <input
              id="hostname"
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleLookup();
                }
              }}
              placeholder="example.com"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleLookup}
              disabled={isLoading || !hostname.trim()}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Lookup All Records
                </>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Fetches all DNS record types (A, AAAA, CNAME, MX, NS, TXT, SOA, SRV, PTR) for the domain
        </p>
      </div>
      )}

      {/* Filter Section */}
      {results.size > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-white flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              Filter Record Types
            </h3>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="px-3 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
              >
                Deselect All
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {RECORD_TYPE_OPTIONS.map((option) => {
              const hasRecords = results.has(option.value);
              const isSelected = selectedTypes.has(option.value);
              const Icon = option.icon;
              
              return (
                <button
                  key={option.value}
                  onClick={() => toggleRecordType(option.value)}
                  disabled={!hasRecords}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
                    !hasRecords
                      ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed border border-slate-700'
                      : isSelected
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-800/60 text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${option.color}`} />
                  <span>{option.label}</span>
                  {hasRecords && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {results.get(option.value)?.count || 0}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-200">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">DNS Lookup Failed</p>
              <p className="text-rose-300/80 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Summary - Always visible */}
      {results.size > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-400" />
                {hostname}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Found {results.size} record type{results.size === 1 ? '' : 's'} with {Array.from(results.values()).reduce((sum, r) => sum + r.count, 0)} total record{Array.from(results.values()).reduce((sum, r) => sum + r.count, 0) === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
              >
                {showDetails ? 'Hide Details' : 'Show Details'}
              </button>
              <button
                onClick={() => copyToClipboard(JSON.stringify(Object.fromEntries(results), null, 2))}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded transition flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy JSON
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {visibleResults.length > 0 && showDetails && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">
                Showing {visibleResults.length} of {results.size} record types
              </p>
            </div>
          </div>

          {visibleResults.map(([type, result]) => {
            const option = RECORD_TYPE_OPTIONS.find(opt => opt.value === type);
            const Icon = option?.icon || Globe;
            
            return (
              <div key={type} className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Icon className={`h-5 w-5 ${option?.color || 'text-slate-400'}`} />
                  <h4 className="text-md font-semibold text-white">{option?.label || type}</h4>
                  <span className="px-2 py-1 bg-slate-800 text-slate-400 text-xs rounded">
                    {result.count} {result.count === 1 ? 'record' : 'records'}
                  </span>
                  {result.cachedFrom && (
                    <span className="text-xs text-slate-500">(from {result.cachedFrom})</span>
                  )}
                </div>
                <div className="space-y-2">
                  {result.records.map((record, index) => (
                    <div
                      key={index}
                      className="bg-slate-800/60 rounded-lg border border-slate-700 p-4 flex items-start justify-between"
                    >
                      <div className="flex-1">
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
                      <button
                        onClick={() => copyToClipboard(record.value)}
                        className="ml-4 p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
                        title="Copy value"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading State */}
      {isLoading && hostname && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-8 text-center text-slate-400">
          <Loader2 className="h-12 w-12 mx-auto mb-4 text-emerald-400 animate-spin" />
          <p className="text-lg font-medium mb-2 text-slate-300">Looking up DNS records...</p>
          <p className="text-sm text-slate-500">Querying DNS for <span className="font-mono text-slate-300">{hostname}</span></p>
        </div>
      )}

      {/* No Results State */}
      {results.size === 0 && !isLoading && !error && hostname && showDetails && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-8 text-center text-slate-400">
          <Globe className="h-12 w-12 mx-auto mb-4 text-slate-500" />
          <p className="text-lg font-medium mb-2">No DNS records found</p>
          <p className="text-sm text-slate-500">No DNS records were found for <span className="font-mono text-slate-300">{hostname}</span></p>
          <p className="text-xs text-slate-600 mt-2">This could mean the domain is not configured with DNS records, or the DNS lookup failed silently.</p>
          
          {/* Show "Buy this domain" button if domain is available */}
          {onBuyDomain && hostname && isValidDomainName(hostname) && isTopLevelDomain(hostname) && !managedDomains.some(d => d.toLowerCase() === hostname.toLowerCase()) && (
            <div className="mt-6">
              <button 
                onClick={() => onBuyDomain(hostname)}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition text-sm font-medium"
              >
                Buy this domain
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
