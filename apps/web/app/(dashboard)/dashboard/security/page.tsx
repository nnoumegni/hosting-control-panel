/* eslint-disable @next/next/no-sync-scripts */
"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Script from 'next/script';
import { Loader2, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../../lib/api';
import { RefreshControls } from '../../../../components/refresh-controls';
import { GatewayStatusPanel } from './_components/gateway-status-panel';

interface DashboardSummary {
  totalRequests: number;
  uniqueIPs: number;
  highRiskIndicators: number;
  attacksPerMinute: number;
  threatCategories: {
    brute_force: number;
    credential_stuffing: number;
    recon: number;
    bot_activity: number;
    clean: number;
  };
}

interface TimeSeriesPoint {
  timestamp: string;
  count: number;
  highRisk: number;
}

interface TimeSeriesData {
  interval: 'hour' | 'day';
  points: TimeSeriesPoint[];
}

interface ThreatCategory {
  category: string;
  count: number;
  ips: number;
}

interface IPSummary {
  ip: string;
  totalCount: number;
  country?: string;
  city?: string;
  region?: string;
  asn: number;
  asnName?: string;
  threatScore: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  threatCategories: string[];
  lastSeen: string;
  lastPath?: string;
}

interface SummaryResponse {
  total: number;
  limit: number;
  offset: number;
  results?: IPSummary[];
  groups?: Array<{ key: string; count: number }>;
}

interface IPReputation {
  ip: string;
  threatScore: number;
  badRequests: number;
  goodRequests: number;
  badPercentage: number;
  failedLogins: number;
  lastSeen: string;
  isBlocked: boolean;
  blockReason?: string;
}

interface IPReputationResponse {
  total: number;
  limit: number;
  reputations: IPReputation[];
}

interface CIDROffender {
  cidr: string;
  mask: number;
  maliciousIPs: number;
  totalIPs: number;
  avgThreatScore: number;
  avgBadPercentage: number;
  totalRequests: number;
  lastAttack: string;
  attackEvents: number;
}

interface CIDROffendersResponse {
  total: number;
  limit: number;
  mask: number;
  offenders: CIDROffender[];
}

interface ASNReputation {
  asn: number;
  asnName: string;
  category: string;
  maliciousIPs: number;
  totalIPs: number;
  avgThreatScore: number;
  avgBadPercentage: number;
  cidrsInvolved: number;
  totalRequests: number;
  lastAttack: string;
}

interface ASNReputationResponse {
  total: number;
  limit: number;
  reputations: ASNReputation[];
}

interface BlockEvent {
  type: 'ip' | 'cidr' | 'asn';
  value: string;
  reason: string;
  score: number;
  duration: string;
  timestamp: string;
}

interface BlockEventsResponse {
  events: BlockEvent[];
  total: number;
}

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [chartLibReady, setChartLibReady] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!(window as any).Chart;
    }
    return false;
  });
  const chartInstancesRef = useRef<Array<{ destroy: () => void }>>([]);
  
  // Log view filters
  const [logFilters, setLogFilters] = useState({
    threatLevel: '',
    country: '',
    cidrMask: '24',
    days: '7',
  });

  // Get selected instance ID from localStorage
  const instanceId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const id = localStorage.getItem('hosting-control-panel:selected-ec2-instance');
      if (id && id.trim().length > 0 && id.startsWith('i-')) {
        return id.trim();
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // React Query hooks for dashboard data
  const dashboardQuery = useQuery({
    queryKey: ['security', 'dashboard', 'all', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      return apiFetch<{
        metrics: DashboardSummary;
        timeline: TimeSeriesData;
        threatCategories: ThreatCategory[];
        topOffenders: IPSummary[];
      }>(`security/dashboard/all?instanceId=${encodeURIComponent(instanceId)}&days=7`);
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    staleTime: 10000, // Consider data fresh for 10 seconds
  });

  const countryQuery = useQuery({
    queryKey: ['security', 'summary', 'country', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      try {
        const response = await apiFetch<SummaryResponse>(`security/summary?instanceId=${encodeURIComponent(instanceId)}&groupBy=country&limit=20&days=7`);
        console.log('[SECURITY] Country query response:', {
          hasGroups: !!response.groups,
          groupsLength: response.groups?.length || 0,
          hasResults: !!response.results,
          resultsLength: response.results?.length || 0,
          sampleGroups: response.groups?.slice(0, 3),
        });
        
        // AGENT BUG: Sometimes returns 'results' instead of 'groups' when groupBy=country
        // Workaround: If groups is missing but results exists, the agent returned wrong format
        if (!response.groups && response.results && response.results.length > 0) {
          console.warn('[SECURITY] Agent returned "results" instead of "groups" for country query. This is an agent bug.');
          // Return empty groups - we can't use results as it's not grouped by country
          return { ...response, groups: [] };
        }
        
        // Validate that we got country data, not CIDR data
        if (response.groups) {
          const hasCidrFormat = response.groups.some(g => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(g.key || ''));
          if (hasCidrFormat) {
            console.error('[SECURITY] Country query returned CIDR data! This is a data integrity issue.');
            // Return empty array to prevent showing wrong data
            return { ...response, groups: [] };
          }
        }
        return response;
      } catch (error) {
        console.error('[SECURITY] Country query failed:', error);
        throw error;
      }
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    select: (data) => {
      const groups = data.groups?.sort((a, b) => b.count - a.count) || [];
      console.log('[SECURITY] Country select - raw groups:', groups.length, 'items');
      // Additional validation: ensure all keys are country codes (2-3 letters) or country names, not CIDR blocks
      const validGroups = groups.filter(g => {
        const key = g.key || '';
        // Country codes are 2-3 letters (ISO codes) or country names (no slashes, no IP format)
        const isCidr = /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(key);
        if (isCidr) {
          console.error(`[SECURITY] Invalid country data detected: "${key}" looks like a CIDR block!`);
          return false;
        }
        return true;
      });
      if (validGroups.length !== groups.length) {
        console.warn(`[SECURITY] Filtered out ${groups.length - validGroups.length} invalid country entries`);
      }
      console.log('[SECURITY] Country select - valid groups:', validGroups.length, 'items');
      return validGroups;
    },
  });

  const asnQuery = useQuery({
    queryKey: ['security', 'summary', 'asn', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      return apiFetch<SummaryResponse>(`security/summary?instanceId=${encodeURIComponent(instanceId)}&limit=200&days=7`);
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    select: (data) => {
      if (!data.results) return [];
      const asnMap = new Map<number, { asn: number; asnName?: string; count: number }>();
      data.results.forEach(ip => {
        if (ip.asn > 0) {
          const existing = asnMap.get(ip.asn);
          if (existing) {
            existing.count += ip.totalCount;
          } else {
            asnMap.set(ip.asn, {
              asn: ip.asn,
              asnName: ip.asnName,
              count: ip.totalCount,
            });
          }
        }
      });
      return Array.from(asnMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
  });

  const cidrQuery = useQuery({
    queryKey: ['security', 'summary', 'cidr', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      try {
        const response = await apiFetch<SummaryResponse>(`security/summary?instanceId=${encodeURIComponent(instanceId)}&groupBy=cidr&cidrMask=24&limit=20&days=7`);
        console.log('[SECURITY] CIDR query response:', {
          hasGroups: !!response.groups,
          groupsLength: response.groups?.length || 0,
          sampleGroups: response.groups?.slice(0, 3),
        });
        // Validate that we got CIDR data
        if (response.groups) {
          const allCidrFormat = response.groups.every(g => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(g.key || ''));
          if (!allCidrFormat && response.groups.length > 0) {
            console.error('[SECURITY] CIDR query returned non-CIDR data! This is a data integrity issue.');
          }
        }
        return response;
      } catch (error) {
        console.error('[SECURITY] CIDR query failed:', error);
        throw error;
      }
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    select: (data) => {
      const groups = data.groups?.sort((a, b) => b.count - a.count) || [];
      console.log('[SECURITY] CIDR select - raw groups:', groups.length, 'items');
      // Ensure all keys are CIDR blocks
      const validGroups = groups.filter(g => {
        const key = g.key || '';
        const isCidr = /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(key);
        if (!isCidr && key) {
          console.error(`[SECURITY] Invalid CIDR data detected: "${key}" is not a CIDR block!`);
          return false;
        }
        return true;
      });
      if (validGroups.length !== groups.length) {
        console.warn(`[SECURITY] Filtered out ${groups.length - validGroups.length} invalid CIDR entries`);
      }
      console.log('[SECURITY] CIDR select - valid groups:', validGroups.length, 'items');
      return validGroups;
    },
  });

  const ipReputationQuery = useQuery({
    queryKey: ['security', 'reputation', 'ip', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      return apiFetch<IPReputationResponse>(`security/reputation/ip?instanceId=${encodeURIComponent(instanceId)}&limit=100`);
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    select: (data) => data.reputations || [],
  });

  const cidrOffendersQuery = useQuery({
    queryKey: ['security', 'reputation', 'cidr', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      return apiFetch<CIDROffendersResponse>(`security/reputation/cidr?instanceId=${encodeURIComponent(instanceId)}&mask=24&limit=100`);
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    select: (data) => data.offenders || [],
  });

  const asnReputationQuery = useQuery({
    queryKey: ['security', 'reputation', 'asn', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      return apiFetch<ASNReputationResponse>(`security/reputation/asn?instanceId=${encodeURIComponent(instanceId)}&limit=100`);
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    select: (data) => data.reputations || [],
  });

  const blockEventsQuery = useQuery({
    queryKey: ['security', 'blocks', 'events', instanceId],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      return apiFetch<BlockEventsResponse>(`security/blocks/events?instanceId=${encodeURIComponent(instanceId)}&days=7`);
    },
    enabled: !!instanceId && activeTab === 'dashboard',
    select: (data) => data.events || [],
  });

  // Log view query
  const logQuery = useQuery({
    queryKey: ['security', 'summary', 'logs', instanceId, logFilters],
    queryFn: async () => {
      if (!instanceId) throw new Error('No instance selected');
      const params = new URLSearchParams({
        instanceId,
        limit: '100',
      });
      if (logFilters.threatLevel) params.append('threatLevel', logFilters.threatLevel);
      if (logFilters.country) params.append('q', logFilters.country);
      if (logFilters.days) params.append('days', logFilters.days);
      if (logFilters.cidrMask && logFilters.cidrMask !== '24') {
        params.append('groupBy', 'cidr');
        params.append('cidrMask', logFilters.cidrMask);
      }
      return apiFetch<SummaryResponse>(`security/summary?${params.toString()}`);
    },
    enabled: !!instanceId && activeTab === 'logs',
  });

  // Extract data from queries
  const metrics = dashboardQuery.data?.metrics || null;
  const timeline = dashboardQuery.data?.timeline || null;
  const threatCategories = dashboardQuery.data?.threatCategories || [];
  const topOffenders = dashboardQuery.data?.topOffenders || [];
  const countryDistribution = countryQuery.data || [];
  const asnDistribution = asnQuery.data || [];
  const cidrDistribution = cidrQuery.data || [];
  const ipReputations = ipReputationQuery.data || [];
  const cidrOffenders = cidrOffendersQuery.data || [];
  const asnReputations = asnReputationQuery.data || [];
  const blockEvents = blockEventsQuery.data || [];
  const logData = logQuery.data || null;

  // Combined loading and error states
  const isLoading = activeTab === 'dashboard' 
    ? dashboardQuery.isLoading && !dashboardQuery.data
    : logQuery.isLoading && !logQuery.data;
  const isRefreshing = activeTab === 'dashboard'
    ? dashboardQuery.isFetching && !!dashboardQuery.data
    : logQuery.isFetching && !!logQuery.data;
  const error = activeTab === 'dashboard'
    ? dashboardQuery.error
    : logQuery.error;

  // Refresh handler using React Query's refetch
  const handleRefresh = useCallback(async () => {
    if (activeTab === 'dashboard') {
      await Promise.all([
        dashboardQuery.refetch(),
        countryQuery.refetch(),
        asnQuery.refetch(),
        cidrQuery.refetch(),
        ipReputationQuery.refetch(),
        cidrOffendersQuery.refetch(),
        asnReputationQuery.refetch(),
        blockEventsQuery.refetch(),
      ]);
    } else {
      await logQuery.refetch();
    }
  }, [activeTab, dashboardQuery, countryQuery, asnQuery, cidrQuery, ipReputationQuery, cidrOffendersQuery, asnReputationQuery, blockEventsQuery, logQuery]);

  // Cleanup charts on unmount
  useEffect(() => {
    return () => {
      chartInstancesRef.current.forEach(chart => {
        try {
          chart.destroy();
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      chartInstancesRef.current = [];
    };
  }, []);

  // Render charts when data is ready
  useEffect(() => {
    if (!chartLibReady || activeTab !== 'dashboard') return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    // Helper function to get or create chart instance for a specific canvas
    const getOrCreateChart = (canvasId: string, createChartFn: (ctx: CanvasRenderingContext2D) => any) => {
      const canvasEl = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!canvasEl) return null;

      let existingChart: any = null;

      // First, try Chart.js's built-in getChart method (Chart.js 3.x+)
      if (typeof Chart.getChart === 'function') {
        try {
          existingChart = Chart.getChart(canvasEl);
        } catch {
          // Ignore errors
        }
      }

      // Also check our ref
      if (!existingChart) {
        existingChart = chartInstancesRef.current.find((chart: any) => {
          try {
            return chart.canvas?.id === canvasId || chart.canvas === canvasEl;
          } catch {
            return false;
          }
        });
      }

      // Destroy existing chart for this canvas if it exists
      if (existingChart) {
        try {
          existingChart.destroy();
          // Remove from our ref if it was there
          const index = chartInstancesRef.current.indexOf(existingChart);
          if (index > -1) {
            chartInstancesRef.current.splice(index, 1);
          }
        } catch (e) {
          // If destroy fails, try to clear the canvas manually
          try {
            const ctx = canvasEl.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            }
          } catch {
            // Ignore
          }
        }
      }

      const ctx = canvasEl.getContext('2d');
      if (!ctx) return null;

      const chart = createChartFn(ctx);
      if (chart) {
        chartInstancesRef.current.push(chart);
      }
      return chart;
    };

    // Threat Categories Donut Chart
    if (threatCategories.length > 0) {
      getOrCreateChart('threatDonutChart', (ctx) => {
        const categoryNames: Record<string, string> = {
          'brute_force': 'Brute Force',
          'credential_stuffing': 'Credential Stuffing',
          'recon': 'Recon',
          'bot_activity': 'Bot Activity',
          'clean': 'Clean',
        };

        return new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: threatCategories.map(c => categoryNames[c.category] || c.category),
            datasets: [{
              data: threatCategories.map(c => c.count),
              backgroundColor: [
                'rgba(239, 68, 68, 0.8)',
                'rgba(251, 146, 60, 0.8)',
                'rgba(251, 191, 36, 0.8)',
                'rgba(59, 130, 246, 0.8)',
                'rgba(34, 197, 94, 0.8)',
              ],
              borderWidth: 0,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#cbd5e1',
                  font: { size: 11 },
                },
              },
            },
          },
        });
      });
    }

    // Timeline Chart
    if (timeline && timeline.points.length > 0) {
      getOrCreateChart('riskTimelineChart', (ctx) => {
        const labels = timeline.points.map(p => {
          const date = new Date(p.timestamp);
          return timeline.interval === 'hour' 
            ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        return new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Total Requests',
                data: timeline.points.map(p => p.count),
                borderColor: 'rgba(99, 102, 241, 1)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
              },
              {
                label: 'High-Risk Events',
                data: timeline.points.map(p => p.highRisk),
                borderColor: 'rgba(239, 68, 68, 1)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: {
                  color: '#cbd5e1',
                  font: { size: 11 },
                },
              },
            },
            scales: {
              x: {
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(148, 163, 184, 0.1)' },
              },
              y: {
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(148, 163, 184, 0.1)' },
              },
            },
          },
        });
      });
    }

    // Country Distribution Bar Chart (Threat Heatmap) - ONLY use countryDistribution
    // CRITICAL: Validate data before rendering to prevent data mixing
    if (countryDistribution.length > 0) {
      // Final validation: ensure we're not accidentally using CIDR data
      const hasCidrData = countryDistribution.some(c => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(c.key || ''));
      if (hasCidrData) {
        console.error('[SECURITY] CRITICAL: Country chart received CIDR data! Blocking render to prevent data corruption.');
        console.error('[SECURITY] Country data sample:', countryDistribution.slice(0, 3));
      } else {
        getOrCreateChart('countryHeatmapChart', (ctx) => {
          const maxCount = Math.max(...countryDistribution.map(c => c.count));
          return new Chart(ctx, {
            type: 'bar',
            data: {
              labels: countryDistribution.map(c => c.key || 'Unknown'),
              datasets: [{
                label: 'Requests by Country',
                data: countryDistribution.map(c => c.count),
                backgroundColor: countryDistribution.map(c => {
                  const intensity = c.count / maxCount;
                  return `rgba(239, 68, 68, ${0.4 + intensity * 0.6})`;
                }),
                borderColor: 'rgba(239, 68, 68, 0.8)',
                borderWidth: 1,
              }],
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  callbacks: {
                    label: (context: { parsed: { x: number } }) => `${context.parsed.x} requests`,
                  },
                },
              },
              scales: {
                x: {
                  ticks: { color: '#94a3b8', font: { size: 10 } },
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                },
                y: {
                  ticks: { color: '#94a3b8', font: { size: 10 } },
                  grid: { display: false },
                },
              },
            },
          });
        });
      }
    }

    // ASN Distribution Pie Chart
    if (asnDistribution.length > 0) {
      getOrCreateChart('asnPieChart', (ctx) => {
        const colors = [
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(20, 184, 166, 0.8)',
          'rgba(14, 165, 233, 0.8)',
          'rgba(168, 85, 247, 0.8)',
        ];
        return new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: asnDistribution.map(a => 
              a.asnName ? `AS${a.asn} (${a.asnName})` : `AS${a.asn}`
            ),
            datasets: [{
              data: asnDistribution.map(a => a.count),
              backgroundColor: colors.slice(0, asnDistribution.length),
              borderWidth: 0,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#cbd5e1',
                  font: { size: 10 },
                  boxWidth: 12,
                  padding: 8,
                },
              },
              tooltip: {
                callbacks: {
                  label: (context: { label?: string; parsed?: number }) => {
                    const label = context.label || '';
                    const value = context.parsed || 0;
                    return `${label}: ${value} requests`;
                  },
                },
              },
            },
          },
        });
      });
    }

    // CIDR Distribution Bar Chart - ONLY use cidrDistribution
    // CRITICAL: Validate data before rendering to prevent data mixing
    if (cidrDistribution.length > 0) {
      // Final validation: ensure we're using actual CIDR data
      const allCidrFormat = cidrDistribution.every(c => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(c.key || ''));
      if (!allCidrFormat && cidrDistribution.length > 0) {
        console.error('[SECURITY] CRITICAL: CIDR chart received non-CIDR data! Blocking render to prevent data corruption.');
        console.error('[SECURITY] CIDR data sample:', cidrDistribution.slice(0, 3));
      } else {
        getOrCreateChart('cidrChart', (ctx) => {
          const maxCount = Math.max(...cidrDistribution.map(c => c.count));
          return new Chart(ctx, {
            type: 'bar',
            data: {
              labels: cidrDistribution.map(c => c.key || 'Unknown'),
              datasets: [{
                label: 'Requests by CIDR',
                data: cidrDistribution.map(c => c.count),
                backgroundColor: cidrDistribution.map(c => {
                  const intensity = c.count / maxCount;
                  return `rgba(251, 191, 36, ${0.4 + intensity * 0.6})`;
                }),
                borderColor: 'rgba(251, 191, 36, 0.8)',
                borderWidth: 1,
              }],
            },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                callbacks: {
                  label: (context: { parsed: { x: number } }) => `${context.parsed.x} requests`,
                },
              },
            },
            scales: {
              x: {
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148, 163, 184, 0.1)' },
              },
              y: {
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { display: false },
              },
            },
          },
        });
        });
      }
    }
  }, [chartLibReady, threatCategories, timeline, countryDistribution, asnDistribution, cidrDistribution, activeTab]);

  const getThreatLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-400';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  const formatCategory = (category: string) => {
    const names: Record<string, string> = {
      'brute_force': 'Brute Force',
      'credential_stuffing': 'Credential Stuffing',
      'recon': 'Recon',
      'bot_activity': 'Bot Activity',
      'clean': 'Clean',
    };
    return names[category] || category;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'brute_force':
      case 'credential_stuffing':
        return 'bg-red-600/40 border-red-800';
      case 'recon':
        return 'bg-yellow-600/40 border-yellow-800';
      case 'bot_activity':
        return 'bg-orange-600/40 border-orange-800';
      case 'clean':
        return 'bg-gray-600/40 border-gray-800';
      default:
        return 'bg-blue-600/40 border-blue-800';
    }
  };

  const getThreatScoreColor = (score: number) => {
    if (score >= 90) return 'text-red-600';
    if (score >= 70) return 'text-red-400';
    if (score >= 50) return 'text-orange-400';
    if (score >= 30) return 'text-yellow-400';
    if (score >= 10) return 'text-slate-400';
    return 'text-green-400';
  };

  const getThreatScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-red-600/20 border-red-600/50';
    if (score >= 70) return 'bg-red-500/20 border-red-500/50';
    if (score >= 50) return 'bg-orange-500/20 border-orange-500/50';
    if (score >= 30) return 'bg-yellow-500/20 border-yellow-500/50';
    if (score >= 10) return 'bg-slate-500/20 border-slate-500/50';
    return 'bg-green-500/20 border-green-500/50';
  };

  const formatBlockType = (type: string) => {
    return type.toUpperCase();
  };

  const formatDuration = (duration: string) => {
    return duration;
  };

  // Only show full loading screen on initial load, not during refresh
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
        <p className="text-slate-400">Loading security dashboard...</p>
      </div>
    );
  }

  if (error && !metrics) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">Security Analytics Dashboard</h1>
        </header>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
          {errorMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Security Analytics Dashboard</h1>
        <div className="flex items-center gap-3">
          <RefreshControls
            onRefresh={handleRefresh}
            autoRefreshEnabled={true}
            refreshInterval={30000}
            isLoading={isRefreshing}
          />
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Logs
          </button>
        </div>
      </header>

      {/* Tab Switcher */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600/30 border-b-2 border-indigo-600 text-indigo-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            Dashboard View
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
              activeTab === 'logs'
                ? 'bg-indigo-600/30 border-b-2 border-indigo-600 text-indigo-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            Log View
          </button>
        </nav>
      </div>

      {/* Dashboard View */}
      {activeTab === 'dashboard' && metrics && (
        <div className="space-y-6">
          {/* Top Metrics Cards */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6 text-center">
              <p className="text-xs text-slate-400">Total Requests</p>
              <h2 className="text-3xl font-semibold mt-2 text-white">
                {metrics.totalRequests.toLocaleString()}
              </h2>
            </div>
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6 text-center">
              <p className="text-xs text-slate-400">Unique Source IPs</p>
              <h2 className="text-3xl font-semibold mt-2 text-white">
                {metrics.uniqueIPs.toLocaleString()}
              </h2>
            </div>
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6 text-center">
              <p className="text-xs text-slate-400">High-Risk Indicators</p>
              <h2 className="text-3xl font-semibold mt-2 text-red-400">
                {metrics.highRiskIndicators.toLocaleString()}
              </h2>
            </div>
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6 text-center">
              <p className="text-xs text-slate-400">Attacks / Minute</p>
              <h2 className="text-3xl font-semibold mt-2 text-yellow-400">
                {Math.round(metrics.attacksPerMinute)}
              </h2>
            </div>
          </section>

          {/* Major Widgets */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Threat Heatmap (Country Distribution) */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 col-span-1">
              <h3 className="text-sm font-semibold mb-2 text-white">Threat Heatmap (Geo-Distribution)</h3>
              {countryDistribution.length > 0 ? (
                <div className="h-64">
                  <canvas id="countryHeatmapChart" className="w-full h-full" />
                </div>
              ) : (
                <div className="w-full h-64 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 text-sm">
                  No country data available
                </div>
              )}
            </div>

            {/* Threat Categories Donut */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-semibold mb-3 text-white">Threat Categories Breakdown</h3>
              {threatCategories.length > 0 ? (
                <div className="h-48">
                  <canvas id="threatDonutChart" className="w-full h-full" />
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>

            {/* CIDR Distribution Chart */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-semibold mb-3 text-white">CIDR Distribution</h3>
              {cidrDistribution.length > 0 ? (
                <div className="h-48">
                  <canvas id="cidrChart" className="w-full h-full" />
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No CIDR data available
                </div>
              )}
            </div>
          </section>

          {/* Row 2 Widgets */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ASN Pie Chart */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-semibold mb-3 text-white">Traffic by ASN</h3>
              {asnDistribution.length > 0 ? (
                <div className="h-48">
                  <canvas id="asnPieChart" className="w-full h-full" />
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No ASN data available
                </div>
              )}
            </div>

            {/* Timeline Chart */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 col-span-2">
              <h3 className="text-sm font-semibold mb-3 text-white">High-Risk Activity Timeline</h3>
              {timeline && timeline.points.length > 0 ? (
                <div className="h-48">
                  <canvas id="riskTimelineChart" className="w-full h-full" />
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>
          </section>

          {/* Offenders Table + Events Feed */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Offending IPs */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 col-span-2">
              <h3 className="text-sm font-semibold mb-4 text-white">Top Offending IPs</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Source IP</th>
                      <th className="px-4 py-2 text-left">ASN</th>
                      <th className="px-4 py-2 text-left">Country</th>
                      <th className="px-4 py-2 text-left">Threat Score</th>
                      <th className="px-4 py-2 text-left">Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topOffenders.length > 0 ? (
                      topOffenders.slice(0, 10).map((ip) => (
                        <tr key={ip.ip} className="border-t border-slate-800 hover:bg-slate-800/40">
                          <td className="px-4 py-2 font-mono text-xs">{ip.ip}</td>
                          <td className="px-4 py-2 text-xs">
                            {ip.asn > 0 ? `AS${ip.asn}` : 'Unknown'}
                          </td>
                          <td className="px-4 py-2 text-xs">{ip.country || 'Unknown'}</td>
                          <td className={`px-4 py-2 text-xs ${getThreatLevelColor(ip.threatLevel)}`}>
                            {ip.threatScore}
                          </td>
                          <td className="px-4 py-2 text-xs">{ip.totalCount}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                          No data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent High-Risk Events */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-semibold mb-4 text-white">Recent High-Risk Events</h3>
              <div className="space-y-4 text-sm">
                {topOffenders.slice(0, 3).map((ip) => {
                  const categories = ip.threatCategories || [];
                  const category = categories.length > 0 ? categories[0] : 'clean';
                  const categoryNames: Record<string, string> = {
                    'brute_force': 'Brute Force Detected',
                    'credential_stuffing': 'Credential Stuffing Detected',
                    'recon': 'Reconnaissance Activity',
                    'bot_activity': 'Bot Activity Detected',
                    'clean': 'Clean Traffic',
                    'suspicious': 'Suspicious Activity',
                  };
                  return (
                    <div
                      key={ip.ip}
                      className={`${getCategoryColor(category)} border p-3 rounded-md`}
                    >
                      <p className="font-medium text-white text-xs">
                        {categoryNames[category] || 'Suspicious Activity'}
                      </p>
                      <p 
                        className="text-xs text-slate-400 mt-1 whitespace-nowrap truncate" 
                        title={`Source: ${ip.ip} — ${ip.lastPath || 'N/A'}`}
                      >
                        Source: {ip.ip} — {ip.lastPath || 'N/A'}
                      </p>
                    </div>
                  );
                })}
                {topOffenders.length === 0 && (
                  <p className="text-slate-400 text-sm text-center py-4">No events</p>
                )}
              </div>
            </div>
          </section>

          {/* Gateway Status Panel */}
          <GatewayStatusPanel />

          {/* Adaptive Blocking Sections */}
          <section className="space-y-6">
            <h2 className="text-xl font-semibold text-white">Adaptive Blocking</h2>
            
            {/* IP Reputation Table */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-semibold mb-4 text-white">IP Reputation</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">IP Address</th>
                      <th className="px-4 py-2 text-left">Threat Score</th>
                      <th className="px-4 py-2 text-left">Bad %</th>
                      <th className="px-4 py-2 text-left">Failed Logins</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ipReputations.length > 0 ? (
                      ipReputations.slice(0, 20).map((ip) => (
                        <tr key={ip.ip} className="border-t border-slate-800 hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-xs">{ip.ip}</td>
                          <td className={`px-4 py-3 text-xs font-semibold ${getThreatScoreColor(ip.threatScore)}`}>
                            {ip.threatScore}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-800 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${ip.badPercentage >= 50 ? 'bg-red-500' : ip.badPercentage >= 25 ? 'bg-orange-500' : 'bg-yellow-500'}`}
                                  style={{ width: `${Math.min(ip.badPercentage, 100)}%` }}
                                />
                              </div>
                              <span className="text-slate-300 w-12 text-right">{ip.badPercentage.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300">{ip.failedLogins}</td>
                          <td className="px-4 py-3">
                            {ip.isBlocked ? (
                              <span className="px-2 py-1 text-xs rounded-lg bg-red-600/40 border border-red-800 text-red-300">
                                Blocked
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs rounded-lg bg-green-600/40 border border-green-800 text-green-300">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {new Date(ip.lastSeen).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">
                          No IP reputation data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CIDR Offenders and ASN Reputation */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* CIDR Offenders */}
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
                <h3 className="text-sm font-semibold mb-4 text-white">CIDR Offenders</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-400 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">CIDR Block</th>
                        <th className="px-4 py-2 text-left">Malicious IPs</th>
                        <th className="px-4 py-2 text-left">Avg Score</th>
                        <th className="px-4 py-2 text-left">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cidrOffenders.length > 0 ? (
                        cidrOffenders.slice(0, 10).map((cidr) => (
                          <tr key={cidr.cidr} className="border-t border-slate-800 hover:bg-slate-800/40">
                            <td className="px-4 py-3 font-mono text-xs">{cidr.cidr}</td>
                            <td className="px-4 py-3 text-xs text-slate-300">
                              {cidr.maliciousIPs} / {cidr.totalIPs}
                            </td>
                            <td className={`px-4 py-3 text-xs font-semibold ${getThreatScoreColor(cidr.avgThreatScore)}`}>
                              {cidr.avgThreatScore.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300">{cidr.attackEvents}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">
                            No CIDR offender data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ASN Reputation */}
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
                <h3 className="text-sm font-semibold mb-4 text-white">ASN Reputation</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-400 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">ASN</th>
                        <th className="px-4 py-2 text-left">Malicious IPs</th>
                        <th className="px-4 py-2 text-left">Avg Score</th>
                        <th className="px-4 py-2 text-left">Requests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asnReputations.length > 0 ? (
                        asnReputations.slice(0, 10).map((asn) => (
                          <tr key={asn.asn} className="border-t border-slate-800 hover:bg-slate-800/40">
                            <td className="px-4 py-3 text-xs">
                              <div className="font-mono">AS{asn.asn}</div>
                              <div className="text-slate-400 text-[10px] truncate max-w-[200px]" title={asn.asnName}>
                                {asn.asnName || 'Unknown'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300">
                              {asn.maliciousIPs} / {asn.totalIPs}
                            </td>
                            <td className={`px-4 py-3 text-xs font-semibold ${getThreatScoreColor(asn.avgThreatScore)}`}>
                              {asn.avgThreatScore.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300">{asn.totalRequests.toLocaleString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">
                            No ASN reputation data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Block Events Timeline */}
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-semibold mb-4 text-white">Block Events Timeline</h3>
              <div className="space-y-3">
                {blockEvents.length > 0 ? (
                  blockEvents.slice(0, 20).map((event, index) => (
                    <div
                      key={`${event.type}-${event.value}-${index}`}
                      className={`${getThreatScoreBgColor(event.score)} border rounded-lg p-3`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 text-xs rounded font-semibold ${
                              event.type === 'ip' ? 'bg-blue-600/40 text-blue-300' :
                              event.type === 'cidr' ? 'bg-purple-600/40 text-purple-300' :
                              'bg-orange-600/40 text-orange-300'
                            }`}>
                              {formatBlockType(event.type)}
                            </span>
                            <span className="font-mono text-xs text-slate-200">{event.value}</span>
                          </div>
                          <p className="text-xs text-slate-300 mb-1">{event.reason}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span>Score: <span className={`font-semibold ${getThreatScoreColor(event.score)}`}>{event.score}</span></span>
                            <span>Duration: {formatDuration(event.duration)}</span>
                            <span>{new Date(event.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400 text-sm text-center py-4">No block events</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Log View */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* Filters */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <label className="text-sm font-medium text-white block mb-2">Threat Level</label>
              <select
                value={logFilters.threatLevel}
                onChange={(e) => setLogFilters({ ...logFilters, threatLevel: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white"
              >
                <option value="">Any</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <label className="text-sm font-medium text-white block mb-2">Geo-IP Country</label>
              <input
                type="text"
                value={logFilters.country}
                onChange={(e) => setLogFilters({ ...logFilters, country: e.target.value })}
                placeholder="e.g. US"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white placeholder-slate-500"
              />
            </div>

            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <label className="text-sm font-medium text-white block mb-2">CIDR Block</label>
              <select
                value={logFilters.cidrMask}
                onChange={(e) => setLogFilters({ ...logFilters, cidrMask: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white"
              >
                <option value="24">/24</option>
                <option value="16">/16</option>
                <option value="8">/8</option>
              </select>
            </div>

            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <label className="text-sm font-medium text-white block mb-2">Time Range</label>
              <select
                value={logFilters.days}
                onChange={(e) => setLogFilters({ ...logFilters, days: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white"
              >
                <option value="1">Last 1 hour</option>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
          </section>

          {/* Logs Table */}
          <section>
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Access Log Events</h3>
                <button
                  onClick={() => void handleRefresh()}
                  disabled={isRefreshing}
                  className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg transition disabled:opacity-50"
                >
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/40 text-slate-400 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Timestamp</th>
                      <th className="px-4 py-3 text-left">Source IP</th>
                      <th className="px-4 py-3 text-left">ASN / ISP</th>
                      <th className="px-4 py-3 text-left">Geo-IP</th>
                      <th className="px-4 py-3 text-left w-48">Endpoint</th>
                      <th className="px-4 py-3 text-left">Threat Score</th>
                      <th className="px-4 py-3 text-left">Indicators</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logData?.results && logData.results.length > 0 ? (
                      logData.results.map((ip) => (
                        <tr
                          key={ip.ip}
                          className="border-b border-slate-800 hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3 text-xs">
                            {new Date(ip.lastSeen).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{ip.ip}</td>
                          <td className="px-4 py-3 text-xs">
                            {ip.asn > 0 ? `AS${ip.asn}` : 'Unknown'}
                            {ip.asnName && ` (${ip.asnName})`}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {ip.country || 'Unknown'} • {ip.city || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-xs w-48">
                            {ip.lastPath ? (
                              <div 
                                className="font-mono" 
                                title={ip.lastPath}
                              >
                                {ip.lastPath.length > 35 
                                  ? `${ip.lastPath.substring(0, 35)}...` 
                                  : ip.lastPath}
                              </div>
                            ) : (
                              <span className="text-slate-500">N/A</span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-xs ${getThreatLevelColor(ip.threatLevel)}`}>
                            {ip.threatScore}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 flex-wrap">
                              {(ip.threatCategories || []).length > 0 ? (
                                ip.threatCategories.map((cat) => (
                                  <span
                                    key={cat}
                                    className={`px-2 py-1 text-xs rounded-lg ${getCategoryColor(cat)}`}
                                  >
                                    {formatCategory(cat)}
                                  </span>
                                ))
                              ) : (
                                <span className="px-2 py-1 text-xs rounded-lg bg-gray-600/40 border-gray-800">
                                  Clean
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-sm">
                          {isRefreshing ? 'Loading...' : 'No log data available'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Chart.js Script */}
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js"
        onLoad={() => {
          setChartLibReady(true);
        }}
      />
    </div>
  );
}

