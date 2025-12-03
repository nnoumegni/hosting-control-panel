/* eslint-disable @next/next/no-sync-scripts */
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import Script from 'next/script';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { RefreshControls } from '../../../../components/refresh-controls';

interface AnalyticsData {
  ip: string;
  country: string;
  browser: string;
  platform: string;
  url: string;
  count: number;
}

interface AnalyticsResponse {
  analyticsData?: AnalyticsData[];
  stats: {
    visitors: number;
    pageviews: number;
    countries: number;
    topBrowser: string;
  };
  aggregations?: {
    byCountry: Record<string, number>;
    byBrowser: Record<string, number>;
    byPlatform: Record<string, number>;
  };
  topPaths?: Array<{ key: string; count: number }>;
  topIPs?: Array<{ key: string; count: number }>;
  topStatus?: Array<{ key: string; count: number }>;
  since?: string;
}

const STORAGE_KEY = 'hosting-control-panel:selected-ec2-instance';

const getStoredInstanceId = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

export default function AnalyticsPage() {
  // Check if libraries are already loaded on mount (for remounts)
  const [chartLibReady, setChartLibReady] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!(window as any).Chart;
    }
    return false;
  });
  const [leafletLibReady, setLeafletLibReady] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!(window as any).L;
    }
    return false;
  });
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Initialize with stored instance ID to avoid empty state on remount
  const [currentInstanceId, setCurrentInstanceId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getStoredInstanceId();
    }
    return '';
  });
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const chartInstancesRef = useRef<Array<{ destroy: () => void }>>([]);
  const mapInstanceRef = useRef<any>(null);
  const geoJsonCacheRef = useRef<any>(null);
  const lastRenderedDataRef = useRef<string | null>(null);
  const mapInitializingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);

  // Load analytics data
  const loadAnalytics = useCallback(async (instanceId: string, isManualRefresh = false) => {
    if (!instanceId) return;

    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await apiFetch<AnalyticsResponse>(`/monitoring/analytics?instanceId=${encodeURIComponent(instanceId)}`);
      setAnalyticsData(data);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load analytics data';
      setError(errorMessage);
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Manual refresh function
  const handleRefresh = useCallback(async () => {
    if (currentInstanceId) {
      await loadAnalytics(currentInstanceId, true);
    }
  }, [currentInstanceId, loadAnalytics]);

  // Listen for instance selection changes
  useEffect(() => {
    // Set initial instance ID from storage if not already set
    const storedId = getStoredInstanceId();
    if (storedId && !currentInstanceId) {
      setCurrentInstanceId(storedId);
    }

    const handleInstanceChange = (newInstanceId: string) => {
      if (newInstanceId && newInstanceId !== currentInstanceId) {
        setCurrentInstanceId(newInstanceId);
        setAnalyticsData(null); // Clear data when instance changes
        setError(null);
        lastRenderedDataRef.current = null; // Reset chart data hash
      }
    };

    // Listen for custom event from ApiEndpointBanner
    const eventHandler = (e: Event) => {
      const event = e as CustomEvent;
      const instanceId = event?.detail?.instanceId || getStoredInstanceId();
      if (instanceId) {
        handleInstanceChange(instanceId);
      }
    };
    window.addEventListener('ec2-instance-selected', eventHandler);
    
    // Poll localStorage less frequently to reduce renders
    const pollInterval = setInterval(() => {
      const storedId = getStoredInstanceId();
      if (storedId && storedId !== currentInstanceId) {
        handleInstanceChange(storedId);
      }
    }, 2000); // Reduced from 1000ms to 2000ms

    return () => {
      window.removeEventListener('ec2-instance-selected', eventHandler);
      clearInterval(pollInterval);
    };
  }, [currentInstanceId]);

  // Reset refs on mount to ensure fresh render on remount
  useEffect(() => {
    // Reset the data hash ref on mount so charts will render
    lastRenderedDataRef.current = null;
    isMountedRef.current = true;
    
    // Check if libraries are already loaded (for remounts where scripts are cached)
    // Use a small timeout to ensure window is fully available
    const checkLibraries = () => {
      if (typeof window !== 'undefined') {
        if ((window as any).Chart) {
          setChartLibReady(true);
        }
        if ((window as any).L) {
          setLeafletLibReady(true);
        }
      }
    };
    
    // Check immediately and also after a short delay (in case scripts are still loading)
    checkLibraries();
    const timeoutId = setTimeout(checkLibraries, 100);
    
    return () => {
      clearTimeout(timeoutId);
      isMountedRef.current = false;
      // Clean up charts on unmount
      chartInstancesRef.current.forEach(chart => chart.destroy());
      chartInstancesRef.current = [];
    };
  }, []); // Empty deps - only run on mount/unmount

  // Load data when instance changes - single source of truth
  useEffect(() => {
    if (currentInstanceId) {
      loadAnalytics(currentInstanceId);
    } else {
      setAnalyticsData(null);
      setError(null);
    }
  }, [currentInstanceId, loadAnalytics]);


  // Update charts when data or chart library is ready
  useEffect(() => {
    if (!chartLibReady || !analyticsData) return;

    // Create a hash of the data to prevent unnecessary re-renders
    const dataHash = JSON.stringify({
      total: analyticsData.stats?.visitors || 0,
      countries: analyticsData.aggregations?.byCountry || {},
      browsers: analyticsData.aggregations?.byBrowser || {},
      platforms: analyticsData.aggregations?.byPlatform || {},
    });

    // Skip if we've already rendered this exact data
    if (lastRenderedDataRef.current === dataHash) {
      return;
    }

    lastRenderedDataRef.current = dataHash;

    // Destroy existing charts
    chartInstancesRef.current.forEach(chart => {
      try {
        chart.destroy();
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
    chartInstancesRef.current = [];

    // Use aggregations if available (new format), otherwise fall back to calculating from analyticsData
    const countryCounts: Record<string, number> = analyticsData.aggregations?.byCountry || {};
    const browserCounts: Record<string, number> = analyticsData.aggregations?.byBrowser || {};
    const platformCounts: Record<string, number> = analyticsData.aggregations?.byPlatform || {};
    
    // Fallback: calculate from analyticsData if aggregations not available
    if (!analyticsData.aggregations && Array.isArray(analyticsData.analyticsData)) {
      analyticsData.analyticsData.forEach((row) => {
        countryCounts[row.country] = (countryCounts[row.country] || 0) + row.count;
        // Only count browsers if browser field is not empty
        if (row.browser && row.browser.trim() !== '' && row.browser !== '-') {
        browserCounts[row.browser] = (browserCounts[row.browser] || 0) + row.count;
        }
        platformCounts[row.platform] = (platformCounts[row.platform] || 0) + row.count;
      });
    }
    
    // Debug logging for browser data
    if (Object.keys(browserCounts).length === 0) {
      console.warn('Browser Usage chart: No browser data available', {
        hasAggregations: !!analyticsData.aggregations,
        byBrowser: analyticsData.aggregations?.byBrowser,
        analyticsDataLength: analyticsData.analyticsData?.length || 0,
      });
    }

    // Update stats
    const visitorsEl = document.getElementById('statVisitors');
    const pageviewsEl = document.getElementById('statPageviews');
    const countriesEl = document.getElementById('statCountries');
    const topBrowserEl = document.getElementById('statTopBrowser');
    if (visitorsEl) visitorsEl.textContent = String(analyticsData.stats.visitors);
    if (pageviewsEl) pageviewsEl.textContent = String(analyticsData.stats.pageviews);
    if (countriesEl) countriesEl.textContent = String(analyticsData.stats.countries);
    if (topBrowserEl) topBrowserEl.textContent = analyticsData.stats.topBrowser;

    // Chart helpers
    function generateColors(n: number) {
      return Array.from({ length: n }, (_, i) => `hsl(${(360 / n) * i}, 75%, 60%)`);
    }

    const chartOptionsBase: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false, labels: { color: '#e5e7eb' } },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.9)',
          borderColor: 'rgba(148,163,184,0.4)',
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(31,41,55,0.4)' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(31,41,55,0.4)' }, beginAtZero: true, precision: 0 },
      },
    };

    // Create charts - use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const Chart = (window as any).Chart as any;
      if (!Chart) {
        console.warn('Chart.js not available');
        return;
      }

      const byCountryEl = document.getElementById('chartByCountry') as HTMLCanvasElement | null;
      const byPlatformEl = document.getElementById('chartByPlatform') as HTMLCanvasElement | null;
      const byBrowserEl = document.getElementById('chartByBrowser') as HTMLCanvasElement | null;
      
      // Helper to ensure canvas has proper dimensions
      // Chart.js with responsive: true will handle sizing, but we ensure initial dimensions
      const ensureCanvasSize = (canvas: HTMLCanvasElement) => {
        const parent = canvas.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          // Ensure parent has dimensions (h-72 = 18rem = 288px typically)
          if (parentRect.width > 0 && parentRect.height > 0) {
            // Chart.js will handle the actual canvas sizing with responsive: true
            // We just ensure the canvas element exists and is in the DOM
          }
        }
      };
      
      if (byCountryEl) {
        ensureCanvasSize(byCountryEl);
        const ctx = byCountryEl.getContext('2d');
        if (ctx) {
          const chart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: Object.keys(countryCounts),
              datasets: [
                {
                  label: 'Visits',
                  data: Object.values(countryCounts),
                  backgroundColor: generateColors(Object.keys(countryCounts).length),
                  borderRadius: 6,
                },
              ],
            },
            options: chartOptionsBase,
          });
          chartInstancesRef.current.push(chart);
        }
      }
      
      if (byPlatformEl) {
        ensureCanvasSize(byPlatformEl);
        const ctx = byPlatformEl.getContext('2d');
        if (ctx) {
          const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: Object.keys(platformCounts),
              datasets: [{ 
                data: Object.values(platformCounts), 
                backgroundColor: generateColors(Object.keys(platformCounts).length) 
              }],
            },
            options: {
              ...chartOptionsBase,
              plugins: { ...chartOptionsBase.plugins, legend: { display: false } },
            },
          });
          chartInstancesRef.current.push(chart);
        }
      }
      
      if (byBrowserEl) {
        // Destroy any existing chart on this canvas first
        const existingChart = (byBrowserEl as any).chart;
        if (existingChart) {
          try {
            existingChart.destroy();
          } catch (e) {
            // Ignore destroy errors
          }
          (byBrowserEl as any).chart = null;
        }
        
        ensureCanvasSize(byBrowserEl);
        const ctx = byBrowserEl.getContext('2d');
        if (ctx) {
          const browserLabels = Object.keys(browserCounts);
          const browserValues = Object.values(browserCounts);
          
          console.log('Browser chart data:', { browserLabels, browserValues, browserCounts });
          
          // If no browser data, show a message instead of an empty chart
          if (browserLabels.length === 0) {
            // Show a message in the canvas
            ctx.clearRect(0, 0, byBrowserEl.width, byBrowserEl.height);
            ctx.fillStyle = '#9ca3af';
            ctx.font = '14px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No browser data available', byBrowserEl.width / 2, byBrowserEl.height / 2);
            return;
          }
          
          // Ensure we're passing plain arrays, not objects with extra properties
          const cleanBrowserValues = browserLabels.map(label => browserCounts[label]);
          
          const chart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: browserLabels,
              datasets: [
                { 
                  label: 'Visits', 
                  data: cleanBrowserValues, 
                  backgroundColor: generateColors(browserLabels.length), 
                  borderRadius: 6,
                  barThickness: 'flex',
                  maxBarThickness: 50,
                },
              ],
            },
            options: { 
              ...chartOptionsBase, 
              indexAxis: 'y',
              animation: {
                duration: 0, // Disable animation to ensure immediate render
              },
              scales: {
                // For horizontal bar chart (indexAxis: 'y'), x is the value axis
                x: {
                  ticks: { color: '#9ca3af' }, 
                  grid: { color: 'rgba(31,41,55,0.4)' },
                  beginAtZero: true,
                  precision: 0,
                },
                // y is the category axis for horizontal bars
                y: {
                  ticks: { color: '#9ca3af' },
                  grid: { 
                    color: 'rgba(31,41,55,0.4)',
                    display: false, // Hide grid lines for category axis
                  },
                },
              },
            },
          });
          
          // Store chart reference on canvas for cleanup
          (byBrowserEl as any).chart = chart;
          chartInstancesRef.current.push(chart);
          
          // Force resize and update to ensure chart renders properly
          // Use a small delay to ensure DOM is fully laid out
          setTimeout(() => {
            try {
              // Check if chart is still valid
              if (chart && !chart.destroyed) {
                chart.resize();
                chart.update('none'); // 'none' mode for instant update without animation
                
                // Verify chart actually rendered
                const chartData = chart.data;
                const chartDatasets = chartData.datasets;
                const meta = chart.getDatasetMeta(0);
                
                console.log('Browser chart updated', {
                  hasData: chartDatasets.length > 0 && chartDatasets[0].data.length > 0,
                  datasetLength: chartDatasets[0]?.data?.length,
                  chartWidth: chart.width,
                  chartHeight: chart.height,
                  barsRendered: meta.data?.length || 0,
                  firstBar: meta.data?.[0] ? {
                    x: meta.data[0].x,
                    y: meta.data[0].y,
                    width: meta.data[0].width,
                    height: meta.data[0].height,
                  } : null,
                  scales: {
                    x: chart.scales.x ? {
                      min: chart.scales.x.min,
                      max: chart.scales.x.max,
                    } : null,
                    y: chart.scales.y ? {
                      min: chart.scales.y.min,
                      max: chart.scales.y.max,
                    } : null,
                  },
                });
              }
            } catch (e) {
              console.warn('Chart resize/update error:', e);
            }
          }, 100); // Small delay to ensure layout is complete
          
          console.log('Browser chart created successfully', { 
            labels: browserLabels, 
            values: cleanBrowserValues,
            canvasSize: { width: byBrowserEl.width, height: byBrowserEl.height },
            canvasRect: byBrowserEl.getBoundingClientRect(),
            chartId: chart.id,
            chartType: chart.config.type,
            indexAxis: chart.config.options?.indexAxis,
          });
        } else {
          console.error('Failed to get 2d context for browser chart');
        }
      } else {
        console.error('Browser chart canvas element not found');
      }
    });

    // Requests Log table removed - data is now aggregated and doesn't include individual IP details
  }, [chartLibReady, analyticsData]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!leafletLibReady || !analyticsData) return;

    const L = (window as any).L as any;
    if (!L) return;

    // Prevent concurrent map initializations
    if (mapInitializingRef.current) {
      return;
    }

    function colorScale(value: number, max: number) {
      if (!value || max <= 0) return 'rgba(30,64,175,0.35)';
      const t = value / max;
      const lightness = 80 - t * 40;
      return `hsl(204, 100%, ${lightness}%)`;
    }
    
    function getFeatureISO2(props: any) {
      const raw = props.ISO_A2 || props['ISO3166-1-Alpha-2'] || '';
      return raw.toString().toUpperCase();
    }
    
    function getFeatureName(props: any) {
      return props.ADMIN || props.name || 'Unknown';
    }
    
    async function renderMap() {
      // Set flag to prevent concurrent initializations
      if (mapInitializingRef.current) {
        return;
      }
      mapInitializingRef.current = true;

      try {
        // Destroy existing map first
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (e) {
            // Ignore errors during cleanup
          }
          mapInstanceRef.current = null;
        }

        // Use cached GeoJSON if available
        let geo = geoJsonCacheRef.current;
        if (!geo) {
          // Use local asset instead of fetching from GitHub
          const response = await fetch('/assets/countries.geojson');
          if (!response.ok) {
            throw new Error(`Failed to load GeoJSON: ${response.status}`);
          }
          geo = await response.json();
          // Cache in memory for subsequent renders
          geoJsonCacheRef.current = geo;
        }
        const visitorsByCountry: Record<string, number> = {};
        
        // Use aggregations if available, otherwise calculate from analyticsData
        if (analyticsData?.aggregations?.byCountry) {
          Object.entries(analyticsData.aggregations.byCountry).forEach(([country, count]) => {
            const code = country.toUpperCase();
            if (code && code !== 'UNKNOWN') {
              visitorsByCountry[code] = count;
            }
          });
        } else if (Array.isArray(analyticsData?.analyticsData)) {
          analyticsData.analyticsData.forEach((r) => {
            const code = (r.country || '').toUpperCase();
            if (!code || code === 'UNKNOWN') return;
            visitorsByCountry[code] = (visitorsByCountry[code] || 0) + r.count;
          });
        }
        
        const values = Object.values(visitorsByCountry);
        const max = values.length ? Math.max(...values) : 0;
        const mapEl = document.getElementById('geoMap');
        if (!mapEl) {
          console.warn('geoMap element not found');
          mapInitializingRef.current = false;
          return;
        }

        // Check if container already has a map instance (Leaflet stores this in _leaflet_id)
        // If it does, we need to clean it up before creating a new one
        if ((mapEl as any)._leaflet_id) {
          // Clear the container to remove any existing map instance
          // This prevents the "Map container is already initialized" error
          mapEl.innerHTML = '';
          delete (mapEl as any)._leaflet_id;
        }
        
        const map = L.map(mapEl, {
          zoomControl: true,
          scrollWheelZoom: false,
          attributionControl: false,
          minZoom: 2,
          maxZoom: 6,
        }).setView([20, 0], 2);
        
        mapInstanceRef.current = map;
        
        L.geoJSON(geo, {
          style: (feat: any) => {
            const iso2 = getFeatureISO2(feat.properties);
            const value = visitorsByCountry[iso2] || 0;
            return { 
              fillColor: colorScale(value, max), 
              fillOpacity: value ? 0.9 : 0.6, 
              color: 'rgba(15,23,42,0.7)', 
              weight: 1 
            };
          },
          onEachFeature: (feat: any, layer: any) => {
            const iso2 = getFeatureISO2(feat.properties);
            const name = getFeatureName(feat.properties);
            const value = visitorsByCountry[iso2] || 0;
            layer.bindTooltip(
              `<div class="text-xs"><b>${name}</b><br>${value} visitor${value === 1 ? '' : 's'}</div>`, 
              { sticky: true }
            );
            layer.on('mouseover', () => layer.setStyle({ weight: 1.5, color: '#e5e7eb' }));
            layer.on('mouseout', () => layer.setStyle({ weight: 1, color: 'rgba(15,23,42,0.7)' }));
          },
        }).addTo(map);
        
        setTimeout(() => {
          try {
            map.invalidateSize();
          } catch {
            /* ignore */
          }
        }, 100);
      } catch (err) {
        console.error('Error loading map:', err);
      } finally {
        mapInitializingRef.current = false;
      }
    }
    
    void renderMap();

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // Ignore errors during cleanup
        }
        mapInstanceRef.current = null;
      }
      mapInitializingRef.current = false;
    };
  }, [leafletLibReady, analyticsData]);

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
        <style>{`
          body { background: radial-gradient(circle at top, #0f172a 0, #020617 45%, #000 100%); }
          .glass { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.3); backdrop-filter: blur(14px); }
          #geoMap { height: 18rem; border-radius: 14px; overflow: hidden; background: #020617; width: 100%; }
          .leaflet-container { background: #020617; }
        `}</style>
      </Head>
      <Script 
        src="https://cdn.jsdelivr.net/npm/chart.js" 
        strategy="afterInteractive" 
        onLoad={() => {
          setChartLibReady(true);
        }}
      />
      <Script 
        src="https://unpkg.com/leaflet/dist/leaflet.js" 
        strategy="afterInteractive" 
        onLoad={() => {
          setLeafletLibReady(true);
        }}
      />

      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Analytics</h1>
            <p className="text-sm text-slate-400 mt-1">Lightweight in-house analytics for your properties</p>
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs md:text-sm bg-emerald-500/15 text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live</span>
          </div>
        </div>
        <RefreshControls
          onRefresh={handleRefresh}
          autoRefreshEnabled={true}
          refreshInterval={30000}
          isLoading={isRefreshing || loading}
        />
      </header>

      {/* MAIN */}
      <div className="space-y-8">
        {error && (
          <div className="glass p-4 rounded-xl border border-red-500/50 bg-red-500/10">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {loading && !analyticsData && (
          <div className="glass p-8 rounded-xl text-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
              <p className="text-slate-300 font-medium">Loading analytics data...</p>
              <p className="text-xs text-slate-400 mt-1">
                {currentInstanceId ? 'Fetching data from agent...' : 'Please select an EC2 instance from the banner above'}
              </p>
            </div>
          </div>
        )}

        {!loading && !analyticsData && !error && currentInstanceId && (
          <div className="glass p-8 rounded-xl text-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-slate-300 font-medium">No data available</p>
              <p className="text-xs text-slate-400 mt-1">
                Analytics data will appear here once available
              </p>
            </div>
          </div>
        )}

        {!loading && !analyticsData && !error && !currentInstanceId && (
          <div className="glass p-8 rounded-xl text-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-slate-300 font-medium">No instance selected</p>
              <p className="text-xs text-slate-400 mt-1">
                Please select an EC2 instance from the banner above
              </p>
            </div>
          </div>
        )}

        {analyticsData && (
          <>
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 w-full">
              <div className="glass p-5 rounded-2xl shadow-xl border border-slate-700/50 flex flex-col justify-between hover:border-emerald-400/40 transition">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">Visitors</p>
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300">Last 24h</span>
                </div>
                <p id="statVisitors" className="text-3xl md:text-4xl font-bold mt-2 tracking-tight">0</p>
                <p className="text-xs text-slate-500 mt-1">Unique IPs</p>
              </div>
              <div className="glass p-5 rounded-2xl shadow-xl border border-slate-700/50 flex flex-col justify-between hover:border-sky-400/40 transition">
                <p className="text-sm text-gray-400">Pageviews</p>
                <p id="statPageviews" className="text-3xl md:text-4xl font-bold mt-2 tracking-tight">0</p>
                <p className="text-xs text-slate-500 mt-1">Total hits</p>
              </div>
              <div className="glass p-5 rounded-2xl shadow-xl border border-slate-700/50 flex flex-col justify-between hover:border-indigo-400/40 transition">
                <p className="text-sm text-gray-400">Countries</p>
                <p id="statCountries" className="text-3xl md:text-4xl font-bold mt-2 tracking-tight">0</p>
                <p className="text-xs text-slate-500 mt-1">Active locations</p>
              </div>
              <div className="glass p-5 rounded-2xl shadow-xl border border-slate-700/50 flex flex-col justify-between hover:border-fuchsia-400/40 transition">
                <p className="text-sm text-gray-400">Top Browser</p>
                <p id="statTopBrowser" className="text-2xl font-semibold mt-2 tracking-tight">-</p>
                <p className="text-xs text-slate-500 mt-1">By pageviews</p>
              </div>
            </div>

            {/* FIRST CHART ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
              <div className="glass p-6 rounded-xl shadow-lg border border-slate-700/50 w-full min-h-[26rem]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Visitors by Country</h2>
                  <span className="text-xs text-slate-400">Top sources</span>
                </div>
                <div className="h-72 w-full">
                  <canvas id="chartByCountry" className="w-full h-full" />
                </div>
              </div>
              <div className="glass p-6 rounded-xl shadow-lg border border-slate-700/50 w-full min-h-[26rem]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Platform Usage</h2>
                  <span className="text-xs text-slate-400">OS breakdown</span>
                </div>
                <div className="h-72 w-full">
                  <canvas id="chartByPlatform" className="w-full h-full" />
                </div>
              </div>
            </div>

            {/* SECOND CHART ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
              <div className="glass p-6 rounded-xl shadow-lg border border-slate-700/50 relative w-full min-h-[26rem]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Global Visitors</h2>
                  <span className="text-xs text-slate-400">Choropleth map</span>
                </div>
                <div id="geoMap" className="h-72 w-full rounded-lg overflow-hidden" />
                <div className="absolute bottom-4 left-6 bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-[11px] flex items-center gap-2">
                  <span className="inline-block h-2 w-6 rounded bg-slate-600" /><span>Low</span>
                  <span className="inline-block h-2 w-6 rounded bg-sky-400" /><span>High</span>
                </div>
              </div>
              <div className="glass p-6 rounded-xl shadow-lg border border-slate-700/50 w-full min-h-[26rem]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Browser Usage</h2>
                  <span className="text-xs text-slate-400">Top user agents</span>
                </div>
                <div className="h-72 w-full">
                  <canvas id="chartByBrowser" className="w-full h-full" />
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </>
  );
}
