import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { getSelectedInstanceId } from '../lib/instance-utils';
import { isValidDomainName, filterValidDomains } from '../lib/domain-validation';

export interface Domain {
  _id: string;
  domain: string;
  instanceId: string;
  [key: string]: any; // Allow additional properties
}

interface UseDomainsOptions {
  /**
   * Instance ID to load domains for. If not provided, uses the selected instance from localStorage.
   */
  instanceId?: string | null;
  /**
   * Whether to automatically load domains on mount and when instanceId changes.
   * @default true
   */
  autoLoad?: boolean;
  /**
   * Whether to deduplicate domains by domain name.
   * @default true
   */
  deduplicate?: boolean;
}

interface UseDomainsReturn {
  domains: Domain[];
  isLoading: boolean;
  error: string | null;
  loadDomains: () => Promise<void>;
  refreshDomains: () => Promise<void>;
}

/**
 * Shared hook for loading and managing domains.
 * Handles deduplication, loading states, and instance ID management.
 * 
 * @example
 * ```tsx
 * const { domains, isLoading, error, refreshDomains } = useDomains();
 * ```
 */
export function useDomains(options: UseDomainsOptions = {}): UseDomainsReturn {
  const {
    instanceId: providedInstanceId,
    autoLoad = true,
    deduplicate = true,
  } = options;

  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(
    providedInstanceId ?? getSelectedInstanceId()
  );

  // Listen for instance changes if not provided explicitly
  useEffect(() => {
    if (providedInstanceId !== undefined) {
      setInstanceId(providedInstanceId);
      return;
    }

    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setInstanceId(newInstanceId);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleInstanceChange);
      window.addEventListener('ec2-instance-selected', handleInstanceChange);
      
      return () => {
        window.removeEventListener('storage', handleInstanceChange);
        window.removeEventListener('ec2-instance-selected', handleInstanceChange);
      };
    }
  }, [providedInstanceId]);

  const loadDomains = useCallback(async () => {
    const targetInstanceId = providedInstanceId ?? instanceId;
    
    if (!targetInstanceId) {
      setError('Instance ID is required to list domains. Please select an EC2 instance from the dropdown above.');
      setIsLoading(false);
      setDomains([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await apiFetch<{ domains: Domain[] }>(
        `domains/domains?instanceId=${encodeURIComponent(targetInstanceId)}`
      );
      
      let domainsList = response.domains || [];
      
      // Filter out invalid domain names first
      domainsList = filterValidDomains(domainsList);
      
      // Deduplicate by domain name if enabled
      if (deduplicate && domainsList.length > 0) {
        const seen = new Map<string, Domain>();
        for (const domain of domainsList) {
          const domainName = domain.domain?.toLowerCase().trim();
          if (domainName) {
            // Keep the first occurrence (or the one with _id if available)
            if (!seen.has(domainName) || !seen.get(domainName)?._id) {
              seen.set(domainName, domain);
            }
          }
        }
        domainsList = Array.from(seen.values());
      }
      
      setDomains(domainsList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load domains';
      setError(errorMessage);
      setDomains([]);
    } finally {
      setIsLoading(false);
    }
  }, [instanceId, providedInstanceId, deduplicate]);

  const refreshDomains = useCallback(async () => {
    await loadDomains();
  }, [loadDomains]);

  // Auto-load domains when instanceId changes
  useEffect(() => {
    if (autoLoad) {
      void loadDomains();
    }
  }, [autoLoad, loadDomains]);

  return {
    domains,
    isLoading,
    error,
    loadDomains,
    refreshDomains,
  };
}

