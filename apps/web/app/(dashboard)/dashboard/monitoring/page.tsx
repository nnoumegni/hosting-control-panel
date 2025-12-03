"use client";

import { useEffect, useState, useCallback } from 'react';
import { 
  Server, 
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { PageLoader } from '../../_components/page-loader';
import { RefreshControls } from '../../../../components/refresh-controls';

interface SystemProcess {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
}

interface SystemMetrics {
  cpuPercent: number;
  totalMem: number;
  usedMem: number;
  memPercent: number;
  load1: number;
  load5: number;
  load15: number;
  processes: SystemProcess[];
}

export default function MonitoringPage() {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get selected instance ID from localStorage
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

  useEffect(() => {
    const instanceId = getSelectedInstanceId();
    setSelectedInstanceId(instanceId);
    
    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setSelectedInstanceId(newInstanceId);
      if (newInstanceId) {
        setIsInitialLoad(true);
      }
    };
    
    window.addEventListener('storage', handleInstanceChange);
    window.addEventListener('ec2-instance-selected', handleInstanceChange);
    
    return () => {
      window.removeEventListener('storage', handleInstanceChange);
      window.removeEventListener('ec2-instance-selected', handleInstanceChange);
    };
  }, [selectedInstanceId]);

  const loadSystemMetrics = useCallback(async (instanceId: string) => {
    try {
      const metrics = await apiFetch<SystemMetrics>(
        `monitoring/system?instanceId=${instanceId}&top=20`
      );
      setSystemMetrics(metrics);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load system metrics', err);
      setSystemMetrics(null);
      setError(err.message || 'Failed to load system metrics');
    }
  }, []);

  const loadAllData = useCallback(async (isRefresh = false) => {
    if (!selectedInstanceId) {
      setIsLoading(false);
      return;
    }

    if (isInitialLoad && !isRefresh) {
      setIsLoading(true);
    } else if (isRefresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      await loadSystemMetrics(selectedInstanceId);
    } catch (err: any) {
      setError(err.message || 'Failed to load monitoring data');
      console.error('Failed to load monitoring data', err);
    } finally {
      setIsLoading(false);
      if (isInitialLoad && !isRefresh) {
        requestAnimationFrame(() => {
          setIsInitialLoad(false);
        });
      }
    }
  }, [selectedInstanceId, isInitialLoad, loadSystemMetrics]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleRefresh = useCallback(async () => {
        if (selectedInstanceId) {
      await loadSystemMetrics(selectedInstanceId);
    }
  }, [selectedInstanceId, loadSystemMetrics]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  if (!selectedInstanceId) {
    return (
      <div className="space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Monitoring Dashboard</h1>
        </header>
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400">Please select an EC2 instance to view monitoring data.</p>
        </div>
      </div>
    );
  }

  return (
    <PageLoader isLoading={isInitialLoad} message="Loading system metrics...">
      <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoring Dashboard</h1>
          <p className="text-slate-400 mt-1">Instance: <span className="font-mono text-slate-300">{selectedInstanceId}</span></p>
        </div>
          <RefreshControls
            onRefresh={handleRefresh}
            autoRefreshEnabled={true}
            isLoading={isLoading}
          />
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <p className="text-red-300">{error}</p>
        </div>
      )}

        {/* System Metrics */}
        {systemMetrics ? (
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Server className="h-5 w-5" />
              System Metrics
          </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-sm text-slate-500 mb-1">CPU Usage</div>
                <div className="text-2xl font-bold text-white">{systemMetrics.cpuPercent.toFixed(1)}%</div>
                <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(systemMetrics.cpuPercent, 100)}%` }}
                />
              </div>
            </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-sm text-slate-500 mb-1">Memory Usage</div>
                <div className="text-2xl font-bold text-white">{systemMetrics.memPercent.toFixed(1)}%</div>
                <div className="mt-1 text-xs text-slate-400">
                  {formatBytes(systemMetrics.usedMem)} / {formatBytes(systemMetrics.totalMem)}
                </div>
                <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                    style={{ width: `${Math.min(systemMetrics.memPercent, 100)}%` }}
                />
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-sm text-slate-500 mb-1">Load Average (1m)</div>
                <div className="text-2xl font-bold text-white">{systemMetrics.load1.toFixed(2)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  5m: {systemMetrics.load5.toFixed(2)} | 15m: {systemMetrics.load15.toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-sm text-slate-500 mb-1">Top Processes</div>
                <div className="text-2xl font-bold text-white">{systemMetrics.processes.length}</div>
                <div className="mt-1 text-xs text-slate-400">Showing top 20</div>
              </div>
            </div>

            {/* Top Processes Table */}
            {systemMetrics.processes.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3 text-slate-300">Top Processes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left p-2 text-slate-400">PID</th>
                        <th className="text-left p-2 text-slate-400">Name</th>
                        <th className="text-right p-2 text-slate-400">CPU %</th>
                        <th className="text-right p-2 text-slate-400">Memory %</th>
                    </tr>
                  </thead>
                  <tbody>
                      {systemMetrics.processes.map((process, idx) => (
                        <tr key={`${process.pid}-${idx}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="p-2 text-slate-300 font-mono text-xs">{process.pid}</td>
                          <td className="p-2 text-slate-300 font-medium">{process.name}</td>
                          <td className="p-2 text-right text-slate-300">
                            <span className={process.cpu > 50 ? 'text-orange-400' : process.cpu > 20 ? 'text-yellow-400' : ''}>
                              {process.cpu.toFixed(1)}%
                            </span>
                        </td>
                          <td className="p-2 text-right text-slate-300">
                            <span className={process.mem > 10 ? 'text-orange-400' : process.mem > 5 ? 'text-yellow-400' : ''}>
                              {process.mem.toFixed(1)}%
                            </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        ) : !isLoading ? (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-16 text-center">
            <Server className="h-16 w-16 text-slate-500 mx-auto mb-4" />
            <p className="text-xl text-slate-400 mb-2">No system metrics available</p>
            <p className="text-sm text-slate-500">
              Unable to load system metrics. Please ensure the monitoring agent is running.
            </p>
              </div>
        ) : null}
    </div>
    </PageLoader>
  );
}
