"use client";

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface RefreshControlsProps {
  /** Callback function to trigger a refresh */
  onRefresh: () => void | Promise<void>;
  /** Whether auto-refresh is enabled by default */
  autoRefreshEnabled?: boolean;
  /** Auto-refresh interval in milliseconds (default: 10000 = 10 seconds) */
  refreshInterval?: number;
  /** Whether the page is currently loading */
  isLoading?: boolean;
  /** Whether to show the auto-refresh toggle (default: true) */
  showAutoRefreshToggle?: boolean;
  /** Custom className for the container */
  className?: string;
}

/**
 * Shared refresh controls component with auto-refresh and manual refresh functionality.
 * Can be used across dashboard pages (analytics, monitoring, etc.)
 */
export function RefreshControls({
  onRefresh,
  autoRefreshEnabled = false,
  refreshInterval = 10000,
  isLoading = false,
  showAutoRefreshToggle = true,
  className = '',
}: RefreshControlsProps) {
  const [autoRefresh, setAutoRefresh] = useState(autoRefreshEnabled);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle auto-refresh
  useEffect(() => {
    // Clean up any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      const interval = setInterval(() => {
        void onRefresh();
      }, refreshInterval);
      
      refreshIntervalRef.current = interval;
      
      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }

    return undefined;
  }, [autoRefresh, refreshInterval, onRefresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, []);

  const handleRefresh = async () => {
    await onRefresh();
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showAutoRefreshToggle && (
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            autoRefresh
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
          type="button"
        >
          {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
        </button>
      )}
      <button
        onClick={handleRefresh}
        disabled={isLoading}
        className="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        type="button"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}

