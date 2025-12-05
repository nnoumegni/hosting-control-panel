"use client";

import { useState, useEffect } from 'react';
import { ChevronDown, Info, HelpCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';

export type DNSProvider = 'route53' | 'cloudflare' | 'manual';

export interface DNSProviderConfig {
  provider: DNSProvider;
  credentials?: {
    // Route53
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_REGION?: string;
    // Cloudflare
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_EMAIL?: string;
    CLOUDFLARE_API_KEY?: string;
    // Webhook (for Manual/Custom DNS)
    WEBHOOK_PRESENT_URL?: string;
    WEBHOOK_CLEANUP_URL?: string;
    WEBHOOK_AUTH_HEADER?: string;
    WEBHOOK_WAIT_SECONDS?: string;
  };
}

interface DNSProviderConfigProps {
  value: DNSProviderConfig;
  onChange: (config: DNSProviderConfig) => void;
  showHelp?: boolean;
  domain?: string; // Domain to detect DNS provider from
  instanceId?: string; // Instance ID for API calls
  preDetected?: boolean; // If true, skip detection (already detected by parent)
}

const providerOptions: Array<{ value: DNSProvider; label: string; description: string }> = [
  {
    value: 'route53',
    label: 'AWS Route53',
    description: 'Automatically manage DNS records using AWS Route53',
  },
  {
    value: 'cloudflare',
    label: 'Cloudflare',
    description: 'Automatically manage DNS records using Cloudflare API',
  },
  {
    value: 'manual',
    label: 'Manual DNS (Webhook)',
    description: 'Use webhook endpoints for DNS management (works with any DNS provider)',
  },
];

export function DNSProviderConfig({ value, onChange, showHelp = true, domain, instanceId, preDetected = false }: DNSProviderConfigProps) {
  const [showProviderHelp, setShowProviderHelp] = useState(false);
  const [showFieldHelp, setShowFieldHelp] = useState<Record<string, boolean>>({});
  const [showProviderSpecificHelp, setShowProviderSpecificHelp] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedDomain, setDetectedDomain] = useState<string | null>(null);
  const [detectionComplete, setDetectionComplete] = useState(false);

  // Reset detected domain and detection state when domain changes
  useEffect(() => {
    if (domain !== detectedDomain) {
      setDetectedDomain(null);
      setDetectionComplete(false);
    }
  }, [domain, detectedDomain]);

  // Detect DNS provider based on domain
  useEffect(() => {
    // Skip detection if already pre-detected by parent component
    if (preDetected) {
      setDetectionComplete(true);
      return;
    }

    const detectProvider = async () => {
      if (!domain || !instanceId) {
        // No domain to detect, mark as complete
        setDetectionComplete(true);
        return;
      }

      // Skip if we've already detected for this domain
      if (detectedDomain === domain) {
        setDetectionComplete(true);
        return;
      }

      // Only detect if provider is still at default (manual) - this means it hasn't been manually changed
      // We use a ref-like check: if provider is manual and credentials are empty, it's likely the default
      const isDefaultProvider = value.provider === 'manual' && 
        (!value.credentials || Object.keys(value.credentials).length === 0);
      
      if (!isDefaultProvider) {
        // Provider has been manually set, don't override, mark as complete
        setDetectionComplete(true);
        return;
      }

      setIsDetecting(true);
      setDetectionComplete(false);
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
                onChange({ provider: 'cloudflare', credentials: {} });
                setDetectedDomain(domain);
                setDetectionComplete(true);
                return;
              }
              
              // Route53 name servers typically contain 'awsdns' or are in format ns-*.awsdns-*.com
              const isRoute53 = zoneDetails.nameServers.some(ns => 
                ns.toLowerCase().includes('awsdns') || ns.toLowerCase().includes('route53')
              );
              
              if (isRoute53) {
                onChange({ provider: 'route53', credentials: {} });
                setDetectedDomain(domain);
                setDetectionComplete(true);
                return;
              }
              
              // Unknown provider, default to manual
              onChange({ provider: 'manual', credentials: {} });
              setDetectedDomain(domain);
              setDetectionComplete(true);
            } else {
              // Has zone but no name servers, default to manual
              onChange({ provider: 'manual', credentials: {} });
              setDetectedDomain(domain);
              setDetectionComplete(true);
            }
          } catch {
            // If we can't get zone details, assume Route53 since zone exists
            onChange({ provider: 'route53', credentials: {} });
            setDetectedDomain(domain);
            setDetectionComplete(true);
          }
        } else {
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
                onChange({ provider: 'cloudflare', credentials: {} });
              } else {
                // Unknown provider, default to manual
                onChange({ provider: 'manual', credentials: {} });
              }
            } else {
              // No NS records found, default to manual
              onChange({ provider: 'manual', credentials: {} });
            }
            setDetectedDomain(domain);
            setDetectionComplete(true);
          } catch {
            // DNS lookup failed, default to manual
            onChange({ provider: 'manual', credentials: {} });
            setDetectedDomain(domain);
            setDetectionComplete(true);
          }
        }
      } catch (error) {
        // Detection failed, default to manual
        console.warn('Failed to detect DNS provider:', error);
        onChange({ provider: 'manual', credentials: {} });
        setDetectedDomain(domain);
        setDetectionComplete(true);
      } finally {
        setIsDetecting(false);
      }
    };

    // Only detect if domain changes and not pre-detected
    if (!preDetected && domain && instanceId) {
      void detectProvider();
    } else {
      // No domain to detect or pre-detected, mark as complete immediately
      setDetectionComplete(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, instanceId, preDetected]); // Include preDetected in dependencies

  const handleProviderChange = (provider: DNSProvider) => {
    onChange({
      provider,
      credentials: {},
    });
  };

  const handleCredentialChange = (key: string, credentialValue: string) => {
    onChange({
      ...value,
      credentials: {
        ...value.credentials,
        [key]: credentialValue || undefined,
      },
    });
  };

  const toggleFieldHelp = (field: string) => {
    setShowFieldHelp((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // Show loading state while detecting
  if (!detectionComplete || isDetecting) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading providers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          DNS Provider
          {showHelp && (
            <button
              type="button"
              onClick={() => setShowProviderSpecificHelp(!showProviderSpecificHelp)}
              className="ml-2 text-slate-400 hover:text-slate-300"
              title={`Help for ${value.provider === 'route53' ? 'AWS Route53' : value.provider === 'cloudflare' ? 'Cloudflare' : value.provider === 'manual' ? 'Manual DNS' : 'Webhook'} configuration`}
            >
              <HelpCircle className="h-4 w-4 inline" />
            </button>
          )}
        </label>
        <div className="relative">
          <select
            value={value.provider}
            onChange={(e) => handleProviderChange(e.target.value as DNSProvider)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none pr-10"
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>
        {showProviderSpecificHelp && (
          <div className="mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
            {value.provider === 'route53' && (
              <>
                <p className="font-medium text-slate-300 mb-1">AWS Route53 Configuration:</p>
                <p className="mb-2">Route53 automatically manages DNS TXT records for ACME challenges. You need AWS credentials with Route53 permissions.</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Access Key ID:</strong> Your AWS IAM access key with Route53 permissions</li>
                  <li><strong>Secret Access Key:</strong> The corresponding secret key</li>
                  <li><strong>Region:</strong> AWS region where your hosted zones are located (default: us-east-1)</li>
                </ul>
                <p className="mt-2 text-amber-300">Note: Wildcard certificates are supported. Auto-renewal is handled automatically by the agent.</p>
              </>
            )}
            {value.provider === 'cloudflare' && (
              <>
                <p className="font-medium text-slate-300 mb-1">Cloudflare Configuration:</p>
                <p className="mb-2">Cloudflare automatically manages DNS TXT records for ACME challenges. You can use either an API Token (recommended) or Email + API Key.</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>API Token (Recommended):</strong> Create in Cloudflare Dashboard → My Profile → API Tokens with Zone:Edit permissions</li>
                  <li><strong>Email + API Key:</strong> Alternative method using your account email and Global API Key</li>
                </ul>
                <p className="mt-2 text-amber-300">Note: Wildcard certificates are supported. Auto-renewal is handled automatically by the agent.</p>
              </>
            )}
            {value.provider === 'manual' && (
              <>
                <p className="font-medium text-slate-300 mb-1">Manual DNS (Webhook) Configuration:</p>
                <p className="mb-2">Manual DNS uses webhook endpoints to manage DNS TXT records for ACME challenges. This works with ANY DNS provider (WHM, GoDaddy, etc.).</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Present URL:</strong> Endpoint called to create DNS TXT records (required)</li>
                  <li><strong>Cleanup URL:</strong> Endpoint called to delete DNS TXT records (optional)</li>
                  <li><strong>Auth Header:</strong> Authorization header for webhook requests (optional)</li>
                  <li><strong>Wait Seconds:</strong> Time to wait for DNS propagation after creating records (default: 60)</li>
                </ul>
                <p className="mt-2 text-amber-300">Note: Wildcard certificates are supported. Auto-renewal is handled automatically by the agent using stored webhook config.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Route53 Configuration */}
      {value.provider === 'route53' && (
        <div className="space-y-3 p-4 rounded-lg border border-slate-700 bg-slate-900/40">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              AWS Access Key ID
              <span className="text-rose-400 ml-1">*</span>
              <button
                type="button"
                onClick={() => toggleFieldHelp('AWS_ACCESS_KEY_ID')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="text"
              value={value.credentials?.AWS_ACCESS_KEY_ID || ''}
              onChange={(e) => handleCredentialChange('AWS_ACCESS_KEY_ID', e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['AWS_ACCESS_KEY_ID'] && (
              <p className="mt-1 text-xs text-slate-400">
                Your AWS access key ID with Route53 permissions. Create one in IAM console.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              AWS Secret Access Key
              <span className="text-rose-400 ml-1">*</span>
              <button
                type="button"
                onClick={() => toggleFieldHelp('AWS_SECRET_ACCESS_KEY')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="password"
              value={value.credentials?.AWS_SECRET_ACCESS_KEY || ''}
              onChange={(e) => handleCredentialChange('AWS_SECRET_ACCESS_KEY', e.target.value)}
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['AWS_SECRET_ACCESS_KEY'] && (
              <p className="mt-1 text-xs text-slate-400">
                Your AWS secret access key. Keep this secure and never share it.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              AWS Region
              <button
                type="button"
                onClick={() => toggleFieldHelp('AWS_REGION')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="text"
              value={value.credentials?.AWS_REGION || 'us-east-1'}
              onChange={(e) => handleCredentialChange('AWS_REGION', e.target.value)}
              placeholder="us-east-1"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['AWS_REGION'] && (
              <p className="mt-1 text-xs text-slate-400">
                AWS region where your Route53 hosted zones are located. Default: us-east-1
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cloudflare Configuration */}
      {value.provider === 'cloudflare' && (
        <div className="space-y-3 p-4 rounded-lg border border-slate-700 bg-slate-900/40">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              API Token (Recommended)
              <button
                type="button"
                onClick={() => toggleFieldHelp('CLOUDFLARE_API_TOKEN')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="password"
              value={value.credentials?.CLOUDFLARE_API_TOKEN || ''}
              onChange={(e) => handleCredentialChange('CLOUDFLARE_API_TOKEN', e.target.value)}
              placeholder="Your Cloudflare API Token"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['CLOUDFLARE_API_TOKEN'] && (
              <p className="mt-1 text-xs text-slate-400">
                Cloudflare API Token with Zone:Edit permissions. Create one in Cloudflare Dashboard → My Profile → API Tokens.
                If using API Token, you don't need to fill Email and API Key below.
              </p>
            )}
          </div>

          <div className="text-xs text-slate-500 text-center">OR</div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Email Address
              <button
                type="button"
                onClick={() => toggleFieldHelp('CLOUDFLARE_EMAIL')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="email"
              value={value.credentials?.CLOUDFLARE_EMAIL || ''}
              onChange={(e) => handleCredentialChange('CLOUDFLARE_EMAIL', e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['CLOUDFLARE_EMAIL'] && (
              <p className="mt-1 text-xs text-slate-400">
                Your Cloudflare account email address. Required if using API Key instead of API Token.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              API Key
              <button
                type="button"
                onClick={() => toggleFieldHelp('CLOUDFLARE_API_KEY')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="password"
              value={value.credentials?.CLOUDFLARE_API_KEY || ''}
              onChange={(e) => handleCredentialChange('CLOUDFLARE_API_KEY', e.target.value)}
              placeholder="Your Cloudflare Global API Key"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['CLOUDFLARE_API_KEY'] && (
              <p className="mt-1 text-xs text-slate-400">
                Your Cloudflare Global API Key. Found in Cloudflare Dashboard → My Profile → API Tokens.
                Required if not using API Token above.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Manual DNS Configuration (Webhook) */}
      {value.provider === 'manual' && (
        <div className="space-y-3 p-4 rounded-lg border border-slate-700 bg-slate-900/40">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Present URL
              <span className="text-rose-400 ml-1">*</span>
              <button
                type="button"
                onClick={() => toggleFieldHelp('WEBHOOK_PRESENT_URL')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="url"
              value={value.credentials?.WEBHOOK_PRESENT_URL || ''}
              onChange={(e) => handleCredentialChange('WEBHOOK_PRESENT_URL', e.target.value)}
              placeholder="https://api.example.com/acme/dns/present"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['WEBHOOK_PRESENT_URL'] && (
              <p className="mt-1 text-xs text-slate-400">
                Endpoint called to create DNS TXT records. Must accept POST with domain and TXT record data.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Cleanup URL
              <button
                type="button"
                onClick={() => toggleFieldHelp('WEBHOOK_CLEANUP_URL')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="url"
              value={value.credentials?.WEBHOOK_CLEANUP_URL || ''}
              onChange={(e) => handleCredentialChange('WEBHOOK_CLEANUP_URL', e.target.value)}
              placeholder="https://api.example.com/acme/dns/cleanup"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['WEBHOOK_CLEANUP_URL'] && (
              <p className="mt-1 text-xs text-slate-400">
                Optional endpoint called to remove DNS TXT records after certificate issuance.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Auth Header
              <button
                type="button"
                onClick={() => toggleFieldHelp('WEBHOOK_AUTH_HEADER')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="text"
              value={value.credentials?.WEBHOOK_AUTH_HEADER || ''}
              onChange={(e) => handleCredentialChange('WEBHOOK_AUTH_HEADER', e.target.value)}
              placeholder="Bearer your-secret-token"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['WEBHOOK_AUTH_HEADER'] && (
              <p className="mt-1 text-xs text-slate-400">
                Optional authorization header value for webhook requests (e.g., "Bearer token" or "ApiKey key").
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Wait Seconds
              <button
                type="button"
                onClick={() => toggleFieldHelp('WEBHOOK_WAIT_SECONDS')}
                className="ml-2 text-slate-400 hover:text-slate-300"
              >
                <HelpCircle className="h-3 w-3 inline" />
              </button>
            </label>
            <input
              type="number"
              value={value.credentials?.WEBHOOK_WAIT_SECONDS || '60'}
              onChange={(e) => handleCredentialChange('WEBHOOK_WAIT_SECONDS', e.target.value)}
              placeholder="60"
              min="0"
              max="300"
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {showFieldHelp['WEBHOOK_WAIT_SECONDS'] && (
              <p className="mt-1 text-xs text-slate-400">
                Seconds to wait after calling present URL before verifying DNS (default: 60). Increase if DNS propagation is slow.
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

