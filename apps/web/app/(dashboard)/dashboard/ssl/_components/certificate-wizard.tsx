"use client";

import { useState, useEffect, useRef } from 'react';
import { Loader2, X, Info, HelpCircle, CheckCircle2, AlertTriangle, Shield, Save } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';
import { DNSProviderConfig as DNSProviderConfigComponent, type DNSProviderConfig } from './dns-provider-config';

interface ACMEAccount {
  email: string;
  environment: 'production' | 'staging';
  configured: boolean;
}

interface DomainCheck {
  domain: string;
  ips: string[];
  error?: string;
}

interface SSLCertificate {
  domain: string;
  issuedAt: string;
  expiresAt: string;
  issuer: string;
  status: 'active' | 'expired' | 'pending' | 'renewing' | 'revoked' | 'failed';
  webServer: string;
  managedBy: 'jetcamer' | 'external' | 'unknown';
  acmeEnvironment?: string;
  acmeAccountEmail?: string;
  lastRenewalAttempt?: string;
  autoRenewEnabled?: boolean;
  challengeType?: 'http' | 'dns';
  sans?: string[];
}

interface CertificateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  instanceId: string;
  initialDomain?: string;
  initialPrefixes?: string[];
  initialChallengeType?: 'http' | 'dns';
}

export function CertificateWizard({ 
  isOpen, 
  onClose, 
  onSuccess, 
  instanceId,
  initialDomain,
  initialPrefixes,
  initialChallengeType,
}: CertificateWizardProps) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState(initialDomain || '');
  const [prefixes, setPrefixes] = useState<string[]>(initialPrefixes || ['www']);
  const [newPrefix, setNewPrefix] = useState('');
  const [challengeType, setChallengeType] = useState<'http' | 'dns'>(initialChallengeType || 'http');
  const [email, setEmail] = useState('');
  const [useStaging, setUseStaging] = useState(false);
  const [domainCheckResult, setDomainCheckResult] = useState<DomainCheck | null>(null);
  const [isCheckingDomain, setIsCheckingDomain] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [issueLogs, setIssueLogs] = useState<string[]>([]);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueErrorDetails, setIssueErrorDetails] = useState<string | null>(null);
  const [issueSuccess, setIssueSuccess] = useState<SSLCertificate | null>(null);
  const [acmeAccount, setAcmeAccount] = useState<ACMEAccount | null>(null);
  const [acmeError, setAcmeError] = useState<string | null>(null);
  const [isConfiguringAcme, setIsConfiguringAcme] = useState(false);

  // DNS Provider configuration
  const [dnsProviderConfig, setDnsProviderConfig] = useState<DNSProviderConfig>({
    provider: 'manual',
    credentials: {},
  });
  const [isDetectingDnsProvider, setIsDetectingDnsProvider] = useState(false);
  const [dnsProviderDetected, setDnsProviderDetected] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void loadACMEAccount();
      // Set initial values if provided
      if (initialDomain) {
        setDomain(initialDomain);
      }
      if (initialPrefixes) {
        setPrefixes(initialPrefixes);
      }
      if (initialChallengeType) {
        setChallengeType(initialChallengeType);
      }
      // Reset wizard state
      setStep(1);
      setNewPrefix('');
      setDomainCheckResult(null);
      setIssueLogs([]);
      setIssueError(null);
      setIssueErrorDetails(null);
      setIssueSuccess(null);
    } else {
      // Reset when modal closes
      setDomain('');
      setPrefixes(['www']);
      setNewPrefix('');
      setChallengeType('http');
      setStep(1);
      setDomainCheckResult(null);
      setIssueLogs([]);
      setIssueError(null);
      setIssueErrorDetails(null);
      setIssueSuccess(null);
      setDnsProviderDetected(false);
      setDnsProviderConfig({ provider: 'manual', credentials: {} });
    }
  }, [isOpen, instanceId, initialDomain, initialPrefixes, initialChallengeType]);

  // Clear error/success states when navigating away from step 3
  useEffect(() => {
    if (step !== 3) {
      setIssueError(null);
      setIssueErrorDetails(null);
      setIssueSuccess(null);
      setIssueLogs([]);
    }
  }, [step]);

  const loadACMEAccount = async () => {
    try {
      const account = await apiFetch<ACMEAccount>(
        `ssl/acme-account?instanceId=${encodeURIComponent(instanceId)}`
      );
      setAcmeAccount(account);
      if (account.configured && !email) {
        setEmail(account.email);
        setUseStaging(account.environment === 'staging');
      }
    } catch (err) {
      console.warn('Failed to load ACME account', err);
      setAcmeAccount(null);
    }
  };

  const detectDnsProvider = async () => {
    if (!domain || !instanceId || dnsProviderDetected) {
      return;
    }

    setIsDetectingDnsProvider(true);
    try {
      // Check if domain has a Route53 hosted zone
      const zonesResponse = await apiFetch<{ zones: Array<{ id: string; name: string }> }>('domains/dns/zones');
      const matchingZone = zonesResponse.zones?.find(zone => {
        const zoneName = zone.name.toLowerCase().replace(/\.$/, '');
        const domainName = domain.toLowerCase();
        return domainName === zoneName || domainName.endsWith(`.${zoneName}`);
      });

      if (matchingZone) {
        // Domain has Route53 hosted zone, check name servers to confirm
        try {
          const zoneDetails = await apiFetch<{ zoneId: string; name: string; nameServers: string[] }>(
            `domains/dns/zones/${matchingZone.id}`
          );
          
          if (zoneDetails.nameServers && zoneDetails.nameServers.length > 0) {
            // Check if name servers indicate Cloudflare
            const isCloudflare = zoneDetails.nameServers.some(ns => 
              ns.toLowerCase().includes('cloudflare')
            );
            
            if (isCloudflare) {
              setDnsProviderConfig({ provider: 'cloudflare', credentials: {} });
              setDnsProviderDetected(true);
              setIsDetectingDnsProvider(false);
              return;
            }
            
            // Route53 name servers typically contain 'awsdns' or are in format ns-*.awsdns-*.com
            const isRoute53 = zoneDetails.nameServers.some(ns => 
              ns.toLowerCase().includes('awsdns') || ns.toLowerCase().includes('route53')
            );
            
            if (isRoute53) {
              setDnsProviderConfig({ provider: 'route53', credentials: {} });
              setDnsProviderDetected(true);
              setIsDetectingDnsProvider(false);
              return;
            }
          }
        } catch {
          // If we can't get zone details, assume Route53 since zone exists
          setDnsProviderConfig({ provider: 'route53', credentials: {} });
          setDnsProviderDetected(true);
          setIsDetectingDnsProvider(false);
          return;
        }
      }

      // No Route53 zone found, try to detect from DNS lookup
      try {
        const dnsResponse = await apiFetch<{ records: Record<string, Array<{ type: string; value: string }>> }>(
          `dns/diagnostics?hostname=${encodeURIComponent(domain)}&instanceId=${encodeURIComponent(instanceId)}`
        );
        
        // Check NS records for Cloudflare
        const nsRecords = dnsResponse.records?.NS;
        if (nsRecords && nsRecords.length > 0) {
          const isCloudflare = nsRecords.some(record => 
            record.value.toLowerCase().includes('cloudflare')
          );
          
          if (isCloudflare) {
            setDnsProviderConfig({ provider: 'cloudflare', credentials: {} });
            setDnsProviderDetected(true);
            setIsDetectingDnsProvider(false);
            return;
          }
        }
      } catch {
        // DNS lookup failed, will default to manual
      }

      // Default to manual if nothing detected
      setDnsProviderConfig({ provider: 'manual', credentials: {} });
      setDnsProviderDetected(true);
    } catch (error) {
      // Detection failed, default to manual
      console.warn('Failed to detect DNS provider:', error);
      setDnsProviderConfig({ provider: 'manual', credentials: {} });
      setDnsProviderDetected(true);
    } finally {
      setIsDetectingDnsProvider(false);
    }
  };

  const checkDomain = async () => {
    if (!domain.trim()) return;

    setIsCheckingDomain(true);
    setDomainCheckResult(null);
    try {
      // Use DNS lookup API for pre-flight check (as per documentation best practices)
      const result = await apiFetch<DomainCheck>(
        `ssl/check-domain?instanceId=${encodeURIComponent(instanceId)}&domain=${encodeURIComponent(domain)}`
      );
      setDomainCheckResult(result);
    } catch (err: any) {
      setDomainCheckResult({
        domain,
        ips: [],
        error: err.message || 'Failed to check domain',
      });
    } finally {
      setIsCheckingDomain(false);
    }
  };

  // Pre-flight DNS check before issuing certificate (as per documentation)
  const verifyDNSBeforeIssuance = async (addLog: (msg: string) => void): Promise<boolean> => {
    if (!domain.trim()) return false;

    try {
      // Check DNS A record exists (best practice from documentation)
      const dnsCheck = await apiFetch<{ count: number; records: Array<{ value: string }> }>(
        `dns/lookup?instanceId=${encodeURIComponent(instanceId)}&hostname=${encodeURIComponent(domain)}&type=A`
      );

      if (dnsCheck.count === 0) {
        setIssueError('DNS Not Configured');
        setIssueErrorDetails(`DNS A record not found for ${domain}. Please add an A record pointing to your server's IP address, then try again.`);
        addLog(`❌ DNS check failed: No A record found for ${domain}`);
        return false;
      }

      const ips = dnsCheck.records.map(r => r.value);
      addLog(`✓ DNS verified: ${domain} resolves to ${ips.join(', ')}`);
      return true;
    } catch (err: any) {
      // If DNS lookup fails, warn but don't block (might be network issue)
      addLog(`⚠️ Warning: Could not verify DNS configuration: ${err.message}`);
      return true; // Allow issuance to proceed
    }
  };

  const configureACME = async () => {
    if (!email.trim()) return;

    setIsConfiguringAcme(true);
    setAcmeError(null);
    try {
      const account = await apiFetch<ACMEAccount>(
        `ssl/acme-account?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            useStaging,
          }),
        }
      );
      setAcmeAccount(account);
      setStep(3);
    } catch (err: any) {
      setAcmeError(err.message || 'Failed to configure ACME account');
      throw err;
    } finally {
      setIsConfiguringAcme(false);
    }
  };

  const issueCertificate = async () => {
    if (!domain.trim()) return;

    setIsIssuing(true);
    setIssueLogs([]);
    setIssueError(null);
    setIssueErrorDetails(null);
    const addLog = (msg: string) => {
      setIssueLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    };

    try {
      addLog(`Starting issuance for ${domain}...`);

      // Pre-flight DNS check (as per documentation best practices)
      addLog('Verifying DNS configuration...');
      const dnsValid = await verifyDNSBeforeIssuance(addLog);
      if (!dnsValid) {
        setIsIssuing(false);
        return;
      }

      const issueConfig: any = {
        domain,
      };

      // Add altNames from prefixes (e.g., ["www"] -> ["www.example.com"])
      // Skip altNames for wildcard domains (they already cover all subdomains)
      if (prefixes.length > 0 && !isWildcardDomain) {
        issueConfig.altNames = prefixes.map(prefix => {
          // Handle wildcard prefix
          if (prefix.startsWith('*')) {
            return `${prefix}.${domain}`;
          }
          // Handle regular prefix
          return `${prefix}.${domain}`;
        });
      }

      // Configure challenge type
      if (challengeType === 'dns') {
        issueConfig.challengeType = 'dns';
        // Map 'manual' to 'webhook' for the agent API
        const providerForAgent = dnsProviderConfig.provider === 'manual' ? 'webhook' : dnsProviderConfig.provider;
        // Set default Wait Seconds to 180 (3 minutes) for manual DNS if not provided
        const credentials = { ...dnsProviderConfig.credentials };
        if (providerForAgent === 'webhook' && !credentials.WEBHOOK_WAIT_SECONDS) {
          credentials.WEBHOOK_WAIT_SECONDS = '180';
        }
        issueConfig.dnsProvider = {
          provider: providerForAgent,
          credentials,
        };
        addLog(`Using DNS-01 challenge with ${dnsProviderConfig.provider === 'manual' ? 'webhook' : dnsProviderConfig.provider} provider...`);
      } else {
        addLog('Using HTTP-01 challenge...');
      }

      addLog('Sending certificate issuance request...');
      addLog('This may take 30-60 seconds. Please wait...');
      
      // Make the API call with proper error handling
      const certificate = await apiFetch<SSLCertificate>(
        `ssl/issue?instanceId=${encodeURIComponent(instanceId)}`,
        {
          method: 'POST',
          body: JSON.stringify(issueConfig),
        }
      ).catch((fetchError: any) => {
        // Log the error for debugging
        console.error('API fetch error:', fetchError);
        addLog(`❌ API request failed: ${fetchError?.message || 'Unknown error'}`);
        throw fetchError;
      });

      // Store success certificate and stop spinner
      setIssueSuccess(certificate);
      setIsIssuing(false);
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        resetWizard();
        onSuccess();
      }, 3000);
    } catch (err: any) {
      // Extract detailed error message from structured error response (as per documentation)
      let errorMessage = 'Failed to issue certificate';
      let errorDetails = '';
      let errorAction = '';
      let errorBody: any = null;

      if (err?.response) {
        // Try to get error from response body (structured format from documentation)
        errorBody = err.response.data || err.response;
        
        if (typeof errorBody === 'string') {
          errorMessage = errorBody;
        } else if (errorBody && typeof errorBody === 'object') {
          // Handle structured error response format from documentation:
          // { success: false, error: "DNS_NOT_CONFIGURED", message: "...", action: "...", details: "...", rawError: "..." }
          if (errorBody.message) {
            errorMessage = errorBody.message; // Primary message to display
          } else if (errorBody.error) {
            errorMessage = errorBody.error;
          }
          
          if (errorBody.action) {
            errorAction = errorBody.action; // Actionable guidance
          }
          
          if (errorBody.details) {
            errorDetails = errorBody.details; // Technical details
          } else if (errorBody.rawError) {
            errorDetails = errorBody.rawError; // Fallback to raw error
          }
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      // Parse structured error codes from documentation
      const errorCode = errorBody?.error;
      
      if (errorCode === 'DNS_NOT_CONFIGURED' || errorMessage.includes('DNS_NOT_CONFIGURED')) {
        errorMessage = errorBody?.message || 'DNS is not configured for this domain';
        errorAction = errorBody?.action || 'Please add an A record pointing to your server\'s IP address, then try again.';
      } else if (errorCode === 'PORT_80_BLOCKED' || errorMessage.includes('bind: address already in use') || errorMessage.includes('port 80')) {
        errorMessage = 'Port 80 is not accessible or blocked';
        errorAction = 'Use DNS-01 challenge instead. HTTP-01 challenge requires port 80 to be available.';
      } else if (errorCode === 'RATE_LIMIT_EXCEEDED' || errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorMessage = 'Let\'s Encrypt rate limit exceeded';
        errorAction = 'Wait 1 hour or use staging environment for testing.';
      } else if (errorCode === 'DNS_PROVIDER_FAILED' || errorMessage.includes('dns provider')) {
        errorMessage = 'DNS provider configuration failed';
        errorAction = 'Check your DNS provider credentials and permissions.';
      } else if (errorCode === 'ACME_NOT_CONFIGURED' || errorMessage.includes('ACME account not configured')) {
        errorMessage = 'SSL service is not configured';
        errorAction = 'Please configure ACME account first in step 2.';
      } else if (errorCode === 'CERTIFICATE_NOT_FOUND' || errorMessage.includes('certificate not found')) {
        errorMessage = 'No certificate found for domain';
        errorAction = 'Issue a new certificate instead.';
      } else if (errorCode === 'INVALID_DOMAIN' || errorMessage.includes('invalid domain')) {
        errorMessage = 'Invalid domain name format';
        errorAction = 'Use a valid domain format (e.g., example.com).';
      } else if (errorCode === 'DNS_PROPAGATION_PENDING' || errorMessage.includes('propagation')) {
        errorMessage = 'DNS records have not propagated yet';
        errorAction = 'Wait 5-10 minutes for DNS propagation, then try again.';
      } else if (errorMessage.includes('403') || errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        errorMessage = 'Authentication failed';
        errorDetails = 'The ACME challenge authentication failed. Check your domain DNS configuration and ensure the domain points to this server.';
      } else if (errorMessage.includes('acme: error presenting token') || errorMessage.includes('presenting token')) {
        errorMessage = 'ACME challenge failed';
        errorDetails = errorMessage;
      } else if (errorMessage.includes('one or more domains had a problem')) {
        errorMessage = 'Domain validation failed';
        errorDetails = errorMessage;
      }

      // Set error state for display (prioritize action over details)
      setIssueError(errorMessage);
      if (errorAction) {
        setIssueErrorDetails(errorAction);
      } else if (errorDetails && errorDetails !== errorMessage) {
        setIssueErrorDetails(errorDetails);
      }
      
      // Add detailed error to logs
      addLog(`❌ Error: ${errorMessage}`);
      if (errorAction) {
        addLog(`   Action: ${errorAction}`);
      }
      if (errorDetails && errorDetails !== errorMessage && errorDetails !== errorAction) {
        addLog(`   Details: ${errorDetails}`);
      }
      
      // Log full error for debugging
      console.error('Certificate issuance error:', err);
      
      // Stop spinner after error is displayed
      setIsIssuing(false);
    } finally {
      // Ensure spinner stops even if there's an unexpected error
      if (isIssuing) {
        setIsIssuing(false);
      }
    }
  };

  const resetWizard = () => {
    setStep(1);
    setDomain('');
    setPrefixes(['www']);
    setNewPrefix('');
    setChallengeType('http');
    setDomainCheckResult(null);
    setIssueLogs([]);
      setIssueError(null);
      setIssueErrorDetails(null);
      setIssueSuccess(null);
      setAcmeError(null);
    setDnsProviderConfig({
      provider: 'route53',
      credentials: {},
    });
  };

  const addPrefix = () => {
    const trimmed = newPrefix.trim().toLowerCase();
    // Allow wildcard (*) or regular prefixes (alphanumeric, hyphens, underscores)
    const isValidPrefix = trimmed && (trimmed === '*' || /^[a-z0-9_-]+$/.test(trimmed));
    if (isValidPrefix && !prefixes.includes(trimmed)) {
      setPrefixes([...prefixes, trimmed]);
      setNewPrefix('');
    }
  };

  const removePrefix = (prefix: string) => {
    setPrefixes(prefixes.filter((p) => p !== prefix));
  };

  // Validate DNS provider configuration
  const isDNSProviderValid = (): boolean => {
    if (challengeType !== 'dns') return true;
    
    const { provider, credentials } = dnsProviderConfig;
    
    switch (provider) {
      case 'route53':
        return !!(
          credentials?.AWS_ACCESS_KEY_ID?.trim() &&
          credentials?.AWS_SECRET_ACCESS_KEY?.trim()
        );
      case 'cloudflare':
        // Either API Token OR (Email + API Key)
        return !!(
          credentials?.CLOUDFLARE_API_TOKEN?.trim() ||
          (credentials?.CLOUDFLARE_EMAIL?.trim() && credentials?.CLOUDFLARE_API_KEY?.trim())
        );
      case 'manual':
        return !!credentials?.WEBHOOK_PRESENT_URL?.trim(); // Require Present URL for webhook
      default:
        return false;
    }
  };

  // Check if domain is a wildcard
  const isWildcardDomain = domain.trim().startsWith('*');
  
  // Check if any prefix is a wildcard
  const hasWildcardPrefix = prefixes.some(p => p === '*' || p.startsWith('*'));
  
  // HTTP-01 cannot be used for wildcard certificates
  const canUseHttp01 = !isWildcardDomain && !hasWildcardPrefix;

  // Auto-switch to DNS-01 if HTTP-01 is not available and currently selected
  useEffect(() => {
    if (!canUseHttp01 && challengeType === 'http') {
      setChallengeType('dns');
    }
  }, [canUseHttp01, challengeType]);

  // Track previous wildcard state to detect transitions
  const prevIsWildcardDomainRef = useRef<boolean | null>(null);

  // Handle prefixes based on wildcard domain status
  useEffect(() => {
    const wasWildcard = prevIsWildcardDomainRef.current;
    
    if (isWildcardDomain) {
      // Clear prefixes for wildcard domains (they cover all subdomains)
      setPrefixes([]);
    } else if (domain.trim()) {
      // For non-wildcard domains, ensure "www" is included by default
      // Only add if: domain just switched from wildcard to non-wildcard, or prefixes is empty
      setPrefixes(prev => {
        // If switching from wildcard or prefixes is empty, add "www"
        if (wasWildcard === true || prev.length === 0) {
          return ['www'];
        }
        // Otherwise keep existing prefixes (user may have removed "www")
        return prev;
      });
    }
    
    prevIsWildcardDomainRef.current = isWildcardDomain;
  }, [isWildcardDomain, domain]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-900">
          <h2 className="text-xl font-semibold text-white">New Certificate Wizard</h2>
          <button
            onClick={() => {
              resetWizard();
              onClose();
            }}
            disabled={isIssuing}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Step indicators */}
          <ol className="flex items-center text-xs text-slate-400 gap-2">
            <li className={`flex items-center gap-2 ${step >= 1 ? 'text-sky-400' : ''}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                  step >= 1 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                1
              </span>
              Domain
            </li>
            <li className={`flex items-center gap-2 ${step >= 2 ? 'text-sky-400' : ''}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                  step >= 2 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                2
              </span>
              ACME Account
            </li>
            <li className={`flex items-center gap-2 ${step >= 3 ? 'text-sky-400' : ''}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                  step >= 3 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                3
              </span>
              Challenge & Issue
            </li>
          </ol>

          {/* Step 1: Domain */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Domain name</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    // Reset DNS provider detection when domain changes
                    setDnsProviderDetected(false);
                    setDnsProviderConfig({ provider: 'manual', credentials: {} });
                  }}
                  placeholder="example.com"
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter the primary domain name.
                </p>
              </div>

              {/* Additional Domain Prefixes */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-2 block">
                  Additional Domain Prefixes (Optional)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  {isWildcardDomain 
                    ? 'Wildcard domain already covers all subdomains. No additional prefixes needed.'
                    : 'Add subdomain prefixes to include in the certificate. "www" is included by default.'}
                </p>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newPrefix}
                    onChange={(e) => setNewPrefix(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addPrefix();
                      }
                    }}
                    placeholder="api, mail, app, * (for wildcard)"
                    disabled={isWildcardDomain}
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    onClick={addPrefix}
                    disabled={!newPrefix.trim() || isWildcardDomain}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                {!isWildcardDomain && prefixes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {prefixes.map((prefix) => (
                      <span
                        key={prefix}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-300 rounded text-xs"
                      >
                        {prefix}.{domain || 'example.com'}
                        <button
                          onClick={() => removePrefix(prefix)}
                          className="hover:text-sky-100"
                          title="Remove prefix"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={checkDomain}
                  disabled={!domain.trim() || isCheckingDomain}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isCheckingDomain ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Check DNS'
                  )}
                </button>
                <button
                  onClick={async () => {
                    if (domain.trim()) {
                      setStep(2);
                      void loadACMEAccount();
                      // Pre-detect DNS provider when moving to step 2
                      void detectDnsProvider();
                    }
                  }}
                  disabled={!domain.trim()}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold transition disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              {domainCheckResult && (
                <div
                  className={`rounded-xl border-2 p-4 ${
                    domainCheckResult.error || domainCheckResult.ips.length === 0
                      ? 'border-red-500/50 bg-gradient-to-br from-red-500/10 to-red-600/5 shadow-lg shadow-red-500/10'
                      : 'border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 shadow-lg shadow-emerald-500/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {domainCheckResult.error || domainCheckResult.ips.length === 0 ? (
                      <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className={`text-sm font-semibold mb-1 ${
                        domainCheckResult.error || domainCheckResult.ips.length === 0
                          ? 'text-red-200'
                          : 'text-emerald-200'
                      }`}>
                        {domainCheckResult.error
                          ? 'DNS Check Failed'
                          : domainCheckResult.ips.length === 0
                            ? 'No DNS Records Found'
                            : 'DNS Check Passed'}
                      </div>
                      <div className={`text-xs ${
                        domainCheckResult.error || domainCheckResult.ips.length === 0
                          ? 'text-red-300/90'
                          : 'text-emerald-300/90'
                      }`}>
                        {domainCheckResult.error
                          ? domainCheckResult.error
                          : domainCheckResult.ips.length === 0
                            ? 'No A/AAAA records found for this domain. Please add DNS records pointing to your server.'
                            : `Domain resolves to: ${domainCheckResult.ips.join(', ')}`}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: ACME Account */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Contact email for Let's Encrypt</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  This email is used for expiry notices and important ACME communication.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={useStaging}
                  onChange={(e) => setUseStaging(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>
                  Use Let's Encrypt <span className="font-semibold">staging</span> (for testing)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
                >
                  Back
                </button>
                <button
                  onClick={async () => {
                    try {
                      await configureACME();
                    } catch (err: any) {
                      // Error is handled in configureACME and displayed via acmeError
                    }
                  }}
                  disabled={!email.trim() || isConfiguringAcme}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isConfiguringAcme ? (
                    <>
                      <Save className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      Next
                    </>
                  )}
                </button>
              </div>

              {/* ACME Configuration Error */}
              {acmeError && (
                <div className="rounded-xl border-2 border-red-500/50 bg-gradient-to-br from-red-500/10 to-red-600/5 p-4 shadow-lg shadow-red-500/10">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="rounded-full bg-red-500/20 p-2">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-red-200 mb-1">
                        ACME Configuration Failed
                      </div>
                      <div className="text-xs text-red-300/90">
                        {acmeError}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Challenge & Issue */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-2 block">Challenge Type</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-lg border border-slate-700 bg-slate-950 ${
                    canUseHttp01 ? 'cursor-pointer hover:bg-slate-900' : 'opacity-50 cursor-not-allowed'
                  }`}>
                    <input
                      type="radio"
                      name="challengeType"
                      value="http"
                      checked={challengeType === 'http'}
                      onChange={() => setChallengeType('http')}
                      disabled={!canUseHttp01}
                      className="mt-0.5 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">HTTP-01 (Standard)</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {canUseHttp01 
                          ? 'This Requires port 80 access for all the domains/subdomains'
                          : isWildcardDomain 
                            ? 'HTTP-01 cannot be used for wildcard domains. Use DNS-01 challenge instead.'
                            : 'HTTP-01 cannot be used for wildcard certificates. Use DNS-01 challenge instead.'}
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-700 bg-slate-950 cursor-pointer hover:bg-slate-900">
                    <input
                      type="radio"
                      name="challengeType"
                      value="dns"
                      checked={challengeType === 'dns'}
                      onChange={() => setChallengeType('dns')}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">DNS-01 (Wildcard)</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {isWildcardDomain 
                          ? `Supports wildcard certificates (${domain}). Requires DNS provider configuration.`
                          : `Supports wildcard certificates (*.${domain}). Requires DNS provider configuration.`}
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* DNS-01 Provider Configuration */}
              {challengeType === 'dns' && (
                <div className="space-y-4">
                  <DNSProviderConfigComponent
                    value={dnsProviderConfig}
                    onChange={setDnsProviderConfig}
                    showHelp={true}
                    domain={domain}
                    instanceId={instanceId}
                    preDetected={dnsProviderDetected}
                  />
                </div>
              )}

              {/* Review Summary or Response Card */}
              {issueSuccess || issueError ? (
                /* Response Card (Success or Error) */
                issueSuccess ? (
                  <div className="p-4 rounded-xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 shadow-lg shadow-emerald-500/10">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="rounded-full bg-emerald-500/20 p-2">
                          <Shield className="h-5 w-5 text-emerald-400" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-emerald-200 mb-3">
                          Certificate Issued Successfully!
                        </div>
                        <div className="text-xs text-slate-300 space-y-2">
                          <div>
                            <span className="text-slate-400">Domain:</span>{' '}
                            <span className="font-mono text-emerald-300">{issueSuccess.domain}</span>
                          </div>
                          {issueSuccess.sans && issueSuccess.sans.length > 0 && (
                            <div>
                              <span className="text-slate-400">Additional domains:</span>{' '}
                              <span className="font-mono text-emerald-300">{issueSuccess.sans.join(', ')}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-slate-400">Expires:</span>{' '}
                            <span className="font-mono text-emerald-300">
                              {new Date(issueSuccess.expiresAt).toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Status:</span>{' '}
                            <span className="font-mono text-emerald-300">{issueSuccess.status}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Error Response Card */
                  <div className="p-4 rounded-xl border-2 border-red-500/50 bg-gradient-to-br from-red-500/10 to-red-600/5 shadow-lg shadow-red-500/10">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="rounded-full bg-red-500/20 p-2">
                          <AlertTriangle className="h-5 w-5 text-red-400" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-red-200 mb-2">
                          Certificate Issuance Failed
                        </div>
                        <div className="text-sm text-red-100 font-medium mb-3 leading-relaxed">
                          {issueError}
                        </div>
                        {issueErrorDetails && (
                          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 mt-3">
                            <div className="text-xs font-semibold text-red-300/90 mb-1.5 uppercase tracking-wide">
                              What to do:
                            </div>
                            <div className="text-xs text-red-200/80 leading-relaxed">
                              {issueErrorDetails}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                /* Review Summary (before/during issuance) */
                <div className="p-4 rounded-lg border border-slate-700 bg-slate-950">
                  <div className="text-xs text-slate-300 space-y-2">
                    <p className="text-slate-200 font-medium mb-2">Review & Issue</p>
                    <ul className="space-y-1">
                      <li>• Domain: <span className="font-mono text-sky-300">{domain}</span></li>
                      {!isWildcardDomain && prefixes.length > 0 && (
                        <li>
                          • Additional: <span className="font-mono text-sky-300">
                            {prefixes.map(p => `${p}.${domain}`).join(', ')}
                          </span>
                        </li>
                      )}
                      <li>• Challenge: <span className="font-mono text-sky-300">{challengeType === 'http' ? 'HTTP-01' : 'DNS-01'}</span></li>
                      <li>• ACME Email: <span className="font-mono text-sky-300">{email}</span></li>
                      <li>• Environment: <span className="font-mono text-sky-300">{useStaging ? 'staging' : 'production'}</span></li>
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition"
                >
                  Back
                </button>
                <button
                  onClick={async () => {
                    try {
                      await issueCertificate();
                    } catch (err: any) {
                      // Error is logged in issueLogs
                    }
                  }}
                  disabled={
                    isIssuing ||
                    !domain.trim() ||
                    (challengeType === 'dns' && !isDNSProviderValid())
                  }
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isIssuing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Issuing...
                    </>
                  ) : (
                    'Issue Certificate'
                  )}
                </button>
              </div>

            </div>
          )}
        </div>
      </div>

    </div>
  );
}

