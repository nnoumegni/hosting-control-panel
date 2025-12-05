"use client";

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, XCircle, Loader2, RefreshCw, Wrench, Server, Network, Shield, Database, Globe, Lock, FileText, Settings, Activity, HardDrive, Clock, ChevronDown, ChevronRight, Grid3x3 } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { getSelectedInstanceId } from '../../../../lib/instance-utils';

interface RequirementResult {
  key: string;
  label: string;
  status: 'OK' | 'WARN' | 'ERROR';
  details?: string;
  fixHint?: string;
}

interface RequirementsReport {
  ok: boolean;
  report: {
    os: string;
    kernel: string;
    hasErrors: boolean;
    hasWarnings: boolean;
    checkedAt: string;
    results: RequirementResult[];
    nftConfigPath?: string;
  };
  error?: string;
}

// Category mapping based on requirement keys
const getCategory = (key: string): string => {
  if (key.startsWith('os.') || key.startsWith('config.') || key.startsWith('systemd.') || key.startsWith('agent.')) {
    return 'Core Infrastructure';
  }
  if (key.startsWith('kernel.')) {
    return 'Kernel Modules';
  }
  if (key.startsWith('nft.') || key.startsWith('prenat.') || key.startsWith('web.ports') || key.startsWith('gateway.')) {
    return 'nftables/Gateway';
  }
  if (key.startsWith('gateway.ai.')) {
    return 'Gateway AI';
  }
  if (key.startsWith('security.') || key.startsWith('aws.')) {
    return 'Security Module';
  }
  if (key.startsWith('requestlog.') || key.startsWith('system.filedescriptors')) {
    return 'Request Analytics';
  }
  if (key.startsWith('ssl.')) {
    return 'SSL Certificate Manager';
  }
  if (key.startsWith('firewall.')) {
    return 'Firewall/NACL Reconciliation';
  }
  if (key.startsWith('webhosting.') || key.startsWith('ftp.')) {
    return 'Web Hosting';
  }
  if (key.startsWith('logs.') || key.startsWith('rsyslog.')) {
    return 'Log Management';
  }
  if (key.startsWith('disk.') || key.startsWith('memory.') || key.startsWith('cpu.')) {
    return 'System Resources';
  }
  if (key.startsWith('network.')) {
    return 'Network Connectivity';
  }
  if (key.startsWith('time.')) {
    return 'Time Synchronization';
  }
  if (key.startsWith('geolite.')) {
    return 'GeoLite Database Updates';
  }
  if (key.startsWith('commands.')) {
    return 'Required System Commands';
  }
  return 'Other';
};

const getCategoryIcon = (category: string) => {
  const icons: Record<string, typeof Server> = {
    'Core Infrastructure': Server,
    'Kernel Modules': Settings,
    'nftables/Gateway': Network,
    'Gateway AI': Activity,
    'Security Module': Shield,
    'Request Analytics': Database,
    'SSL Certificate Manager': Lock,
    'Firewall/NACL Reconciliation': Shield,
    'Web Hosting': Globe,
    'Log Management': FileText,
    'System Resources': HardDrive,
    'Network Connectivity': Network,
    'Time Synchronization': Clock,
    'GeoLite Database Updates': Database,
    'Required System Commands': Settings,
    'Other': Settings,
  };
  return icons[category] || Settings;
};

const statusConfig = {
  OK: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/30',
    label: 'OK',
  },
  WARN: {
    icon: AlertCircle,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/30',
    label: 'Warning',
  },
  ERROR: {
    icon: XCircle,
    color: 'text-rose-400',
    bgColor: 'bg-rose-400/10',
    borderColor: 'border-rose-400/30',
    label: 'Error',
  },
};

export default function SoftwareStatusPage() {
  const [report, setReport] = useState<RequirementsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [installingKey, setInstallingKey] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // null = "All"
  const [selectedStatus, setSelectedStatus] = useState<'OK' | 'WARN' | 'ERROR' | null>(null); // null = "All"
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [manuallyExpandedCategories, setManuallyExpandedCategories] = useState<Set<string>>(new Set());
  const [manuallyCollapsedCategories, setManuallyCollapsedCategories] = useState<Set<string>>(new Set());

  // Listen for instance changes
  useEffect(() => {
    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setSelectedInstanceId(newInstanceId);
    };

    if (typeof window !== 'undefined') {
      const initialInstanceId = getSelectedInstanceId();
      setSelectedInstanceId(initialInstanceId);

      window.addEventListener('storage', handleInstanceChange);
      window.addEventListener('ec2-instance-selected', handleInstanceChange);

      return () => {
        window.removeEventListener('storage', handleInstanceChange);
        window.removeEventListener('ec2-instance-selected', handleInstanceChange);
      };
    }
  }, []);

  const checkRequirements = useCallback(async () => {
    if (!selectedInstanceId) {
      setError('Please select an EC2 instance from the dropdown above.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await apiFetch<RequirementsReport>(
        `gateway/requirements?instanceId=${encodeURIComponent(selectedInstanceId)}`
      );
      setReport(data);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Failed to check requirements';
      setError(message);
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstanceId]);

  const installAllRequirements = useCallback(async () => {
    if (!selectedInstanceId) {
      setError('Please select an EC2 instance from the dropdown above.');
      return;
    }

    try {
      setIsInstalling(true);
      setError(null);
      const data = await apiFetch<RequirementsReport>(
        `gateway/requirements?instanceId=${encodeURIComponent(selectedInstanceId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ install: true }),
        }
      );
      setReport(data);
      // Auto-refresh after a short delay to show updated status
      setTimeout(() => {
        void checkRequirements();
      }, 1000);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Failed to install requirements';
      setError(message);
    } finally {
      setIsInstalling(false);
    }
  }, [selectedInstanceId, checkRequirements]);

  const installRequirement = useCallback(async (key: string) => {
    if (!selectedInstanceId) {
      setError('Please select an EC2 instance from the dropdown above.');
      return;
    }

    try {
      setInstallingKey(key);
      setError(null);
      const data = await apiFetch<RequirementsReport>(
        `gateway/requirements?instanceId=${encodeURIComponent(selectedInstanceId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ key, install: true }),
        }
      );
      setReport(data);
      // Auto-refresh after a short delay
      setTimeout(() => {
        void checkRequirements();
      }, 1000);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : `Failed to install requirement: ${key}`;
      setError(message);
    } finally {
      setInstallingKey(null);
    }
  }, [selectedInstanceId, checkRequirements]);

  // Load requirements on mount and when instance changes
  useEffect(() => {
    if (selectedInstanceId) {
      void checkRequirements();
    }
  }, [selectedInstanceId, checkRequirements]);

  // Group requirements by category
  const groupedRequirements = report?.report.results.reduce((acc, req) => {
    const category = getCategory(req.key);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(req);
    return acc;
  }, {} as Record<string, RequirementResult[]>) || {};

  // Calculate status counts for all requirements
  const statusCounts = report?.report.results.reduce((acc, req) => {
    acc[req.status] = (acc[req.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  // Calculate status counts per category
  const categoryStatusCounts = Object.entries(groupedRequirements).reduce((acc, [category, reqs]) => {
    acc[category] = reqs.reduce((counts, req) => {
      counts[req.status] = (counts[req.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    return acc;
  }, {} as Record<string, Record<string, number>>);

  // Get all categories for filter cards
  const allCategories = ['All', ...Object.keys(groupedRequirements).sort()];

  // Filter requirements based on selected category and status
  const filteredRequirements = Object.entries(groupedRequirements).reduce((acc, [category, reqs]) => {
    // Filter by category
    if (selectedCategory !== null && selectedCategory !== 'All' && category !== selectedCategory) {
      return acc;
    }
    
    // Filter by status
    const filteredReqs = selectedStatus === null
      ? reqs
      : reqs.filter(req => req.status === selectedStatus);
    
    if (filteredReqs.length > 0) {
      acc[category] = filteredReqs;
    }
    
    return acc;
  }, {} as Record<string, RequirementResult[]>);

  // Auto-expand all categories when a status filter is selected
  // Collapse by default when "All" is selected (unless manually expanded)
  useEffect(() => {
    const allCategoryNames = Object.keys(groupedRequirements);
    
    if (selectedStatus !== null) {
      // When a status filter is selected, expand all categories
      // But respect manually collapsed categories
      const expanded = new Set(
        allCategoryNames.filter(cat => !manuallyCollapsedCategories.has(cat))
      );
      setExpandedCategories(expanded);
    } else {
      // When "All" is selected, only keep manually expanded categories
      setExpandedCategories(new Set(
        allCategoryNames.filter(cat => manuallyExpandedCategories.has(cat))
      ));
    }
  }, [selectedStatus, groupedRequirements, manuallyExpandedCategories, manuallyCollapsedCategories]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        // Collapsing
        next.delete(category);
        // Track as manually collapsed
        setManuallyCollapsedCategories((collapsed) => {
          const collapsedNext = new Set(collapsed);
          collapsedNext.add(category);
          return collapsedNext;
        });
        // Remove from manually expanded
        setManuallyExpandedCategories((manual) => {
          const manualNext = new Set(manual);
          manualNext.delete(category);
          return manualNext;
        });
      } else {
        // Expanding
        next.add(category);
        // Remove from manually collapsed
        setManuallyCollapsedCategories((collapsed) => {
          const collapsedNext = new Set(collapsed);
          collapsedNext.delete(category);
          return collapsedNext;
        });
        // Add to manually expanded (only matters when "All" is selected)
        setManuallyExpandedCategories((manual) => {
          const manualNext = new Set(manual);
          manualNext.add(category);
          return manualNext;
        });
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Software Status</h1>
          <p className="text-slate-400 mt-1">
            Check and install system requirements for the JetCamer agent and all its features
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={checkRequirements}
            disabled={isLoading || !selectedInstanceId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </>
            )}
          </button>
          <button
            onClick={installAllRequirements}
            disabled={isInstalling || !selectedInstanceId || isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4" />
                Install All
              </>
            )}
          </button>
        </div>
      </header>

      {/* Error Display */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* System Info */}
      {report?.report && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-400">OS:</span>
                <span className="text-slate-200 ml-2 font-mono">{report.report.os}</span>
              </div>
              <div>
                <span className="text-slate-400">Kernel:</span>
                <span className="text-slate-200 ml-2 font-mono">{report.report.kernel}</span>
              </div>
              {report.report.nftConfigPath && (
                <div>
                  <span className="text-slate-400">nftables Config:</span>
                  <span className="text-slate-200 ml-2 font-mono">{report.report.nftConfigPath}</span>
                </div>
              )}
            </div>
            <div className="text-slate-400">
              Checked: {new Date(report.report.checkedAt).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Status Summary Cards (Clickable Filters) */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* All Card */}
          <button
            onClick={() => {
              // If "All" is already selected, clicking again does nothing (it's the default state)
              // If another status is selected, clicking "All" selects it (shows all)
              if (selectedStatus !== null) {
                setSelectedStatus(null);
              }
            }}
            className={`rounded-xl border-2 p-4 transition text-left ${
              selectedStatus === null
                ? 'bg-sky-600/20 border-sky-500 shadow-lg shadow-sky-500/20'
                : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm mb-1 ${selectedStatus === null ? 'text-sky-300' : 'text-slate-400'}`}>All</p>
                <p className="text-2xl font-bold text-white">{report.report.results.length}</p>
              </div>
              <Grid3x3 className={`h-8 w-8 ${selectedStatus === null ? 'text-sky-400' : 'text-slate-300'}`} />
            </div>
          </button>
          
          {/* Status Cards */}
          {Object.entries(statusConfig).map(([status, config]) => {
            const count = statusCounts[status] || 0;
            const Icon = config.icon;
            const isSelected = selectedStatus === status;
            return (
              <button
                key={status}
                onClick={() => setSelectedStatus(isSelected ? null : (status as 'OK' | 'WARN' | 'ERROR'))}
                className={`rounded-xl border-2 p-4 transition text-left ${
                  isSelected
                    ? `${config.bgColor} ${config.borderColor} shadow-lg ${status === 'OK' ? 'shadow-emerald-500/20' : status === 'WARN' ? 'shadow-amber-500/20' : 'shadow-rose-500/20'}`
                    : `${config.bgColor} ${config.borderColor} hover:opacity-80 border-opacity-30`
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm mb-1 ${isSelected ? config.color : 'text-slate-400'}`}>{config.label}</p>
                    <p className="text-2xl font-bold text-white">{count}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${config.color}`} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading State */}
      {isLoading && !report && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      )}

      {/* Requirements by Category */}
      {report && Object.keys(filteredRequirements).length > 0 && (
        <div className="space-y-6">
          {Object.entries(filteredRequirements)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, reqs]) => {
              const CategoryIcon = getCategoryIcon(category);
              const isExpanded = expandedCategories.has(category);
              const counts = categoryStatusCounts[category] || {};
              
              return (
                <div key={category} className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-2 p-6 hover:bg-slate-800/30 transition"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    )}
                    <CategoryIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    <h2 className="text-xl font-semibold text-white text-left">{category}</h2>
                    <div className="flex items-center gap-2 ml-auto">
                      {selectedStatus === null ? (
                        // Show all badges when no filter is selected
                        <>
                          {counts.OK > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                              {counts.OK} OK
                            </span>
                          )}
                          {counts.WARN > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                              {counts.WARN} WARN
                            </span>
                          )}
                          {counts.ERROR > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                              {counts.ERROR} ERROR
                            </span>
                          )}
                        </>
                      ) : (
                        // Show only the selected filter badge
                        (() => {
                          const selectedCount = counts[selectedStatus] || 0;
                          if (selectedCount > 0) {
                            const config = statusConfig[selectedStatus];
                            return (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color} border ${config.borderColor} font-medium`}>
                                {selectedCount} {config.label.toUpperCase()}
                              </span>
                            );
                          }
                          return null;
                        })()
                      )}
                      <span className="text-sm text-slate-400 ml-2">
                        ({reqs.length})
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-6 pb-6 space-y-3">
                      {reqs.map((req) => {
                        const config = statusConfig[req.status];
                        const Icon = config.icon;
                        const isInstallingThis = installingKey === req.key;
                        return (
                          <div
                            key={req.key}
                            className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Icon className={`h-5 w-5 ${config.color} flex-shrink-0`} />
                                  <h3 className="font-semibold text-white">{req.label}</h3>
                                  <span className={`text-xs font-medium px-2 py-1 rounded ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                                    {config.label}
                                  </span>
                                </div>
                                {req.details && (
                                  <p className="text-sm text-slate-400 mb-1 ml-7">{req.details}</p>
                                )}
                                {req.fixHint && (
                                  <p className="text-sm text-amber-300 mb-2 ml-7">
                                    <strong>Fix:</strong> {req.fixHint}
                                  </p>
                                )}
                                <p className="text-xs text-slate-500 ml-7 font-mono">{req.key}</p>
                              </div>
                              {req.status !== 'OK' && (
                                <button
                                  onClick={() => installRequirement(req.key)}
                                  disabled={isInstallingThis || isInstalling}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                  {isInstallingThis ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      Installing...
                                    </>
                                  ) : (
                                    <>
                                      <Wrench className="h-3 w-3" />
                                      Fix
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !report && !error && (
        <div className="text-center py-12 text-slate-400">
          <p>No requirements data available.</p>
          <p className="text-sm mt-2">Select an EC2 instance and click "Refresh" to check requirements.</p>
        </div>
      )}
    </div>
  );
}
