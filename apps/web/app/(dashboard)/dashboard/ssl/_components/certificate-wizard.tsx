"use client";

import { useState, useEffect } from 'react';
import { Loader2, X, Info, HelpCircle, CheckCircle2, AlertTriangle, Shield, Save } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';

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
  const [showWebhookHelp, setShowWebhookHelp] = useState(false);
  const [acmeError, setAcmeError] = useState<string | null>(null);
  const [isConfiguringAcme, setIsConfiguringAcme] = useState(false);

  // Webhook DNS configuration
  const [webhookPresentUrl, setWebhookPresentUrl] = useState('');
  const [webhookCleanupUrl, setWebhookCleanupUrl] = useState('');
  const [webhookAuthHeader, setWebhookAuthHeader] = useState('');
  const [webhookWaitSeconds, setWebhookWaitSeconds] = useState('60');

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
      if (prefixes.length > 0) {
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
        issueConfig.dnsProvider = {
          provider: 'webhook',
          credentials: {
            WEBHOOK_PRESENT_URL: webhookPresentUrl,
            WEBHOOK_CLEANUP_URL: webhookCleanupUrl,
            WEBHOOK_AUTH_HEADER: webhookAuthHeader || undefined,
            WEBHOOK_WAIT_SECONDS: webhookWaitSeconds || '60',
          },
        };
        addLog('Using DNS-01 challenge with webhook provider...');
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
      } else if (errorCode === 'WEBHOOK_FAILED' || errorMessage.includes('webhook')) {
        errorMessage = 'DNS webhook endpoint failed';
        errorAction = 'Check webhook accessibility and authentication token.';
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
    setWebhookPresentUrl('');
    setWebhookCleanupUrl('');
    setWebhookAuthHeader('');
    setWebhookWaitSeconds('60');
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
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter the primary domain name. "www" prefix will be added by default, but you can customize it in step 3.
                </p>
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
                  onClick={() => {
                    if (domain.trim()) {
                      setStep(2);
                      void loadACMEAccount();
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
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-700 bg-slate-950 cursor-pointer hover:bg-slate-900">
                    <input
                      type="radio"
                      name="challengeType"
                      value="http"
                      checked={challengeType === 'http'}
                      onChange={() => setChallengeType('http')}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">HTTP-01 (Standard)</div>
                      <div className="text-xs text-slate-400 mt-1">
                        Issues certificate for {domain} and www.{domain}. Requires port 80 access.
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
                        Supports wildcard certificates (*.{domain}). Requires webhook DNS endpoints.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Additional Domain Prefixes */}
              <div>
                <label className="text-xs font-medium text-slate-300 mb-2 block">
                  Additional Domain Prefixes (Optional)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Add subdomain prefixes to include in the certificate. "www" is included by default.
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
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    onClick={addPrefix}
                    disabled={!newPrefix.trim()}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium transition disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                {prefixes.length > 0 && (
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

              {/* DNS-01 Webhook Configuration */}
              {challengeType === 'dns' && (
                <div className="space-y-4 p-4 rounded-lg border border-slate-700 bg-slate-950">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300">Webhook DNS Configuration</label>
                    <button
                      onClick={() => setShowWebhookHelp(true)}
                      className="p-1 text-slate-400 hover:text-slate-300"
                      title="Webhook DNS Help"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">
                        Present URL <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="url"
                        value={webhookPresentUrl}
                        onChange={(e) => setWebhookPresentUrl(e.target.value)}
                        placeholder="https://api.yourservice.com/acme/dns/present"
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">
                        Cleanup URL <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="url"
                        value={webhookCleanupUrl}
                        onChange={(e) => setWebhookCleanupUrl(e.target.value)}
                        placeholder="https://api.yourservice.com/acme/dns/cleanup"
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Auth Header (Optional)</label>
                      <input
                        type="text"
                        value={webhookAuthHeader}
                        onChange={(e) => setWebhookAuthHeader(e.target.value)}
                        placeholder="Bearer your-secret-token"
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Wait Seconds</label>
                      <input
                        type="number"
                        value={webhookWaitSeconds}
                        onChange={(e) => setWebhookWaitSeconds(e.target.value)}
                        placeholder="60"
                        min="30"
                        max="300"
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Time to wait for DNS propagation (30-300 seconds)
                      </p>
                    </div>
                  </div>
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
                      {prefixes.length > 0 && (
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
                    (challengeType === 'dns' && (!webhookPresentUrl.trim() || !webhookCleanupUrl.trim()))
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

      {/* Webhook Help Modal */}
      {showWebhookHelp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => setShowWebhookHelp(false)}>
          <div
            className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Info className="h-5 w-5 text-sky-400" />
                Webhook DNS Configuration
              </h3>
              <button
                onClick={() => setShowWebhookHelp(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div>
                <h4 className="text-white font-medium mb-2">Why Use Webhook DNS?</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Wildcard certificates (*.example.com)</li>
                  <li>Auto-renewal support</li>
                  <li>Works with ANY DNS provider (WHM, GoDaddy, etc.)</li>
                  <li>Uses your existing DNS code</li>
                </ul>
              </div>

              <div>
                <h4 className="text-white font-medium mb-2">What You Need to Implement</h4>
                <p className="text-slate-400 mb-3">
                  Two webhook endpoints that handle DNS TXT record operations:
                </p>

                <div className="bg-slate-950 rounded-lg p-4 space-y-3">
                  <div>
                    <h5 className="text-sky-300 font-medium mb-2">1. Present Endpoint (Create TXT Record)</h5>
                    <p className="text-xs text-slate-400 mb-2">POST {webhookPresentUrl || 'https://api.yourservice.com/acme/dns/present'}</p>
                    <div className="bg-slate-900 rounded p-3 text-xs font-mono text-slate-300 overflow-x-auto">
                      <div>Request Body:</div>
                      <div>{'{'}</div>
                      <div className="ml-4">"domain": "app.example.com",</div>
                      <div className="ml-4">"recordName": "_acme-challenge.app.example.com.",</div>
                      <div className="ml-4">"recordValue": "xYz123AbC456...",</div>
                      <div className="ml-4">"zone": "example.com"</div>
                      <div>{'}'}</div>
                      <div className="mt-2">Response:</div>
                      <div>{'{ "success": true, "message": "TXT record created" }'}</div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sky-300 font-medium mb-2">2. Cleanup Endpoint (Delete TXT Record)</h5>
                    <p className="text-xs text-slate-400 mb-2">POST {webhookCleanupUrl || 'https://api.yourservice.com/acme/dns/cleanup'}</p>
                    <div className="bg-slate-900 rounded p-3 text-xs font-mono text-slate-300 overflow-x-auto">
                      <div>Request Body:</div>
                      <div>{'{'}</div>
                      <div className="ml-4">"domain": "app.example.com",</div>
                      <div className="ml-4">"recordName": "_acme-challenge.app.example.com.",</div>
                      <div className="ml-4">"zone": "example.com"</div>
                      <div>{'}'}</div>
                      <div className="mt-2">Response:</div>
                      <div>{'{ "success": true, "message": "TXT record deleted" }'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-200">
                    <p className="font-medium mb-1">Important Notes:</p>
                    <ul className="list-disc list-inside space-y-1 text-amber-300/80">
                      <li>Both endpoints must authenticate using the Auth Header (if provided)</li>
                      <li>Parse the subdomain from recordName: "_acme-challenge.app.example.com." → "_acme-challenge.app"</li>
                      <li>Create/delete TXT records in your DNS provider</li>
                      <li>Wait seconds determines how long to wait for DNS propagation</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

