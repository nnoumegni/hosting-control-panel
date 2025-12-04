import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { getSelectedInstanceId } from '../lib/instance-utils';

export type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA' | 'SRV' | 'PTR' | 'ANY';

export interface DNSRecord {
  type: string;
  value: string;
  priority?: number;
  ttl?: number;
}

export interface DNSLookupResponse {
  hostname: string;
  recordType: string;
  records: DNSRecord[];
  count: number;
  cachedFrom?: string;
}

export interface DNSErrorResponse {
  error: string;
  hostname: string;
  type: string;
}

interface UseDNSLookupOptions {
  /**
   * Instance ID to use for DNS lookup. If not provided, uses the selected instance from localStorage.
   */
  instanceId?: string | null;
  /**
   * Whether to automatically perform lookup when hostname or recordType changes.
   * @default false
   */
  autoLookup?: boolean;
}

interface UseDNSLookupReturn {
  /**
   * Perform DNS lookup
   */
  lookup: (hostname: string, recordType?: DNSRecordType) => Promise<DNSLookupResponse | null>;
  /**
   * Current lookup result
   */
  result: DNSLookupResponse | null;
  /**
   * Current error, if any
   */
  error: string | null;
  /**
   * Whether lookup is in progress
   */
  isLoading: boolean;
  /**
   * Clear current result and error
   */
  clear: () => void;
}

/**
 * Custom hook for performing DNS lookups consistently across the application.
 * 
 * @example
 * ```tsx
 * const { lookup, result, isLoading, error } = useDNSLookup();
 * 
 * const handleLookup = async () => {
 *   await lookup('example.com', 'A');
 * };
 * ```
 */
export function useDNSLookup(options: UseDNSLookupOptions = {}): UseDNSLookupReturn {
  const { instanceId: providedInstanceId, autoLookup = false } = options;
  
  const [result, setResult] = useState<DNSLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const lookup = useCallback(
    async (hostname: string, recordType: DNSRecordType = 'A'): Promise<DNSLookupResponse> => {
      if (!hostname.trim()) {
        const errorMessage = 'Hostname is required';
        setError(errorMessage);
        setResult(null);
        throw new Error(errorMessage);
      }

      const targetInstanceId = providedInstanceId ?? getSelectedInstanceId();
      if (!targetInstanceId) {
        const errorMessage = 'Instance ID is required. Please select an EC2 instance from the dropdown above.';
        setError(errorMessage);
        setResult(null);
        throw new Error(errorMessage);
      }

      setIsLoading(true);
      setError(null);
      setResult(null);

      try {
        const response = await apiFetch<DNSLookupResponse>(
          `dns/lookup?hostname=${encodeURIComponent(hostname.trim())}&type=${recordType}&instanceId=${encodeURIComponent(targetInstanceId)}`
        );
        setResult(response);
        return response;
      } catch (err: any) {
        const errorMessage = err?.response?.data?.error || err?.message || 'Failed to perform DNS lookup';
        setError(errorMessage);
        setResult(null);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [providedInstanceId],
  );

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    lookup,
    result,
    error,
    isLoading,
    clear,
  };
}

