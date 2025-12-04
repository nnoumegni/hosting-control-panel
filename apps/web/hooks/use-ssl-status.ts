"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { getSelectedInstanceId } from '../lib/instance-utils';

interface SSLCertificateHealth {
  domain: string;
  status: 'active' | 'expired' | 'pending' | 'renewing' | 'revoked' | 'failed';
  expiresAt: string;
  daysToExpiry: number;
  autoRenewEnabled?: boolean;
  challengeType?: 'http' | 'dns';
  sans?: string[];
}

interface CertificateHealthResponse {
  timestamp: string;
  items: SSLCertificateHealth[];
}

interface UseSSLStatusOptions {
  instanceId?: string | null;
  autoLoad?: boolean;
}

interface UseSSLStatusReturn {
  certificates: SSLCertificateHealth[];
  isLoading: boolean;
  error: string | null;
  refreshCertificates: () => Promise<void>;
  /**
   * Check if a domain has an active SSL certificate
   */
  hasActiveCertificate: (domain: string) => boolean;
  /**
   * Get certificate for a specific domain
   */
  getCertificate: (domain: string) => SSLCertificateHealth | null;
}

/**
 * Shared hook to manage SSL certificate status
 * Used across domains page and SSL page to ensure consistent status checking
 */
export function useSSLStatus(options: UseSSLStatusOptions = {}): UseSSLStatusReturn {
  const { instanceId: providedInstanceId, autoLoad = true } = options;
  const [certificates, setCertificates] = useState<SSLCertificateHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentInstanceId, setCurrentInstanceId] = useState<string | null>(
    providedInstanceId ?? getSelectedInstanceId(),
  );

  // Listen for instance changes from the top bar dropdown
  useEffect(() => {
    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setCurrentInstanceId(newInstanceId);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleInstanceChange);
      window.addEventListener('ec2-instance-selected', handleInstanceChange);

      return () => {
        window.removeEventListener('storage', handleInstanceChange);
        window.removeEventListener('ec2-instance-selected', handleInstanceChange);
      };
    }
  }, []);

  const refreshCertificates = useCallback(async () => {
    const targetInstanceId = providedInstanceId ?? currentInstanceId;

    if (!targetInstanceId) {
      setError(null);
      setCertificates([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const health = await apiFetch<CertificateHealthResponse>(
        `ssl/health?instanceId=${encodeURIComponent(targetInstanceId)}`
      );
      const sortedCertificates = (health.items || []).sort((a, b) => a.daysToExpiry - b.daysToExpiry);
      setCertificates(sortedCertificates);
    } catch (err: any) {
      console.error('Failed to load SSL certificates', err);
      setError(err.message || 'Failed to load SSL certificates');
      setCertificates([]);
    } finally {
      setIsLoading(false);
    }
  }, [providedInstanceId, currentInstanceId]);

  useEffect(() => {
    if (autoLoad) {
      void refreshCertificates();
    }
  }, [autoLoad, refreshCertificates]);

  /**
   * Check if a domain has an active SSL certificate
   * Matches the logic used on the SSL page - checks certificate status === 'active'
   * Handles domain matching including www prefixes and SANs
   */
  const hasActiveCertificate = useCallback(
    (domain: string): boolean => {
      if (!domain) return false;

      // Normalize domain for comparison (lowercase, remove trailing dot, handle www)
      const normalizeDomain = (d: string) => {
        if (!d) return '';
        return d.toLowerCase().replace(/\.$/, '').trim();
      };

      const normalizedDomain = normalizeDomain(domain);
      const normalizedDomainWithoutWww = normalizedDomain.replace(/^www\./, '');

      // Check if domain matches any certificate (including SANs)
      return certificates.some((cert) => {
        // Only check active certificates (consistent with SSL page)
        if (cert.status !== 'active') {
          return false;
        }

        // Check main domain (with and without www)
        const certDomain = normalizeDomain(cert.domain);
        const certDomainWithoutWww = certDomain.replace(/^www\./, '');
        
        if (certDomain === normalizedDomain || 
            certDomainWithoutWww === normalizedDomainWithoutWww ||
            certDomain === normalizedDomainWithoutWww ||
            certDomainWithoutWww === normalizedDomain) {
          return true;
        }

        // Check SANs (Subject Alternative Names) - includes www.example.com automatically added by agent
        if (cert.sans && cert.sans.length > 0) {
          return cert.sans.some((san) => {
            const normalizedSan = normalizeDomain(san);
            const normalizedSanWithoutWww = normalizedSan.replace(/^www\./, '');
            
            return normalizedSan === normalizedDomain ||
                   normalizedSanWithoutWww === normalizedDomainWithoutWww ||
                   normalizedSan === normalizedDomainWithoutWww ||
                   normalizedSanWithoutWww === normalizedDomain;
          });
        }

        return false;
      });
    },
    [certificates],
  );

  /**
   * Get certificate for a specific domain
   * Returns the certificate if domain matches (including www variants and SANs)
   */
  const getCertificate = useCallback(
    (domain: string): SSLCertificateHealth | null => {
      if (!domain) return null;

      // Normalize domain for comparison (lowercase, remove trailing dot, handle www)
      const normalizeDomain = (d: string) => {
        if (!d) return '';
        return d.toLowerCase().replace(/\.$/, '').trim();
      };

      const normalizedDomain = normalizeDomain(domain);
      const normalizedDomainWithoutWww = normalizedDomain.replace(/^www\./, '');

      // Find matching certificate
      for (const cert of certificates) {
        // Check main domain (with and without www)
        const certDomain = normalizeDomain(cert.domain);
        const certDomainWithoutWww = certDomain.replace(/^www\./, '');
        
        if (certDomain === normalizedDomain || 
            certDomainWithoutWww === normalizedDomainWithoutWww ||
            certDomain === normalizedDomainWithoutWww ||
            certDomainWithoutWww === normalizedDomain) {
          return cert;
        }

        // Check SANs
        if (cert.sans && cert.sans.length > 0) {
          for (const san of cert.sans) {
            const normalizedSan = normalizeDomain(san);
            const normalizedSanWithoutWww = normalizedSan.replace(/^www\./, '');
            
            if (normalizedSan === normalizedDomain ||
                normalizedSanWithoutWww === normalizedDomainWithoutWww ||
                normalizedSan === normalizedDomainWithoutWww ||
                normalizedSanWithoutWww === normalizedDomain) {
              return cert;
            }
          }
        }
      }

      return null;
    },
    [certificates],
  );

  return {
    certificates,
    isLoading,
    error,
    refreshCertificates,
    hasActiveCertificate,
    getCertificate,
  };
}

