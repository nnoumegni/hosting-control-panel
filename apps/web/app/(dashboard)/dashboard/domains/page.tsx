"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, Plus, Trash2, Lock, Unlock, ExternalLink, Search, Globe } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { getSelectedInstanceId } from '../../../../lib/instance-utils';
import { isValidDomainName, filterValidDomains, isTopLevelDomain } from '../../../../lib/domain-validation';
import { useDomains } from '../../../../hooks/use-domains';
import { useSSLStatus } from '../../../../hooks/use-ssl-status';
import { useDNSLookup } from '../../../../hooks/use-dns-lookup';
import { DNSLookupPanel } from '../dns/_components/dns-lookup-panel';
import { WebServerInstallPanel } from './_components/web-server-install-panel';
import { AddDomainModal } from './_components/add-domain-modal';
import { DeleteConfirmationModal } from './_components/delete-confirmation-modal';
import { FtpAccountsPanel } from './_components/ftp-accounts-panel';

interface WebServerInfo {
  type: 'nginx' | 'apache' | 'none';
  version?: string;
  isRunning: boolean;
}

interface HostedDomain {
  domain: string;
  serverBlock: string;
  documentRoot?: string;
  sslEnabled: boolean;
  sslCertificate?: string;
  configPath: string;
}

interface ServerInfo {
  instanceId: string;
  webServer: WebServerInfo;
  domains: HostedDomain[];
  publicIp?: string;
}

interface DnsRecord {
  name: string;
  type: string;
  ttl?: number;
  values: string[];
}

interface ZoneRecords {
  zoneId: string;
  zoneName: string;
  records: DnsRecord[];
}

interface SSLCertificate {
  domain: string;
  certificatePath: string;
  keyPath: string;
  chainPath?: string;
  expiryDate?: string;
  daysUntilExpiry?: number;
  issuer?: string;
  isWildcard: boolean;
}

interface SSMAgentStatus {
  isInstalled: boolean;
  isRunning: boolean;
  installationInProgress?: boolean;
  installationCommandId?: string;
}

export default function DomainsPage() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'ssl' | 'email' | 'ftp' | 'dns'>('info');
  const [dnsLookupDomain, setDnsLookupDomain] = useState<string | null>(null);
  const [showDnsLookupForm, setShowDnsLookupForm] = useState(false);
  const [dnsLookupError, setDnsLookupError] = useState<string | null>(null);
  const [dnsLookupHasRecords, setDnsLookupHasRecords] = useState<boolean>(false);
  const [dnsLookupCompleted, setDnsLookupCompleted] = useState<boolean>(false);
  const [dnsRecords, setDnsRecords] = useState<ZoneRecords | null>(null);
  const [sslCertificates, setSslCertificates] = useState<SSLCertificate[]>([]);
  const [isLoadingDns, setIsLoadingDns] = useState(false);
  const [isLoadingSsl, setIsLoadingSsl] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [sslError, setSslError] = useState<string | null>(null);
  const [isLoadingEmailIdentities, setIsLoadingEmailIdentities] = useState(false);
  const [emailIdentitiesError, setEmailIdentitiesError] = useState<string | null>(null);
  const [emailIdentities, setEmailIdentities] = useState<Array<{ email: string; status: string }>>([]);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [ssmAgentStatus, setSsmAgentStatus] = useState<SSMAgentStatus | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationMessage, setInitializationMessage] = useState('Checking SSM agent status...');
  const installationPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [hasInstanceId, setHasInstanceId] = useState<boolean | null>(null); // null = checking, true = has it, false = doesn't have it
  const isInitializingRef = useRef(false);
  
  // Selected instance ID state (for hooks that need it)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return getSelectedInstanceId();
    }
    return null;
  });

  // Listen for instance changes
  useEffect(() => {
    const handleInstanceChange = () => {
      const newInstanceId = getSelectedInstanceId();
      setSelectedInstanceId(newInstanceId);
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
  
  // Web server installation state
  const [isInstallingWebServer, setIsInstallingWebServer] = useState(false);
  const [webServerInstallProgress, setWebServerInstallProgress] = useState<string>('');
  const webServerInstallPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Web server uninstallation state
  const [isUninstallingWebServer, setIsUninstallingWebServer] = useState(false);
  const [webServerUninstallProgress, setWebServerUninstallProgress] = useState<string>('');
  const webServerUninstallPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Domain management state - use shared hook
  const { domains: managedDomains, isLoading: isLoadingDomains, refreshDomains: refreshManagedDomains } = useDomains({
    instanceId: selectedInstanceId,
    autoLoad: false, // We'll load manually after serverInfo loads
  });

  // Use shared SSL status hook to check certificate status (consistent with SSL page)
  const { hasActiveCertificate, refreshCertificates: refreshSSLStatus } = useSSLStatus({
    instanceId: selectedInstanceId,
    autoLoad: !!selectedInstanceId,
  });

  // Refresh SSL status when domains are refreshed or server info changes
  useEffect(() => {
    if (selectedInstanceId && serverInfo) {
      void refreshSSLStatus();
    }
  }, [selectedInstanceId, serverInfo, refreshSSLStatus]);
  const [isAddDomainModalOpen, setIsAddDomainModalOpen] = useState(false);
  const [, setIsCreatingDomain] = useState(false);
  
  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<{ id: string; name: string } | null>(null);

  // Note: getSelectedInstanceId is now imported from lib/instance-utils

  // Load SES email identities (filtered by selected domain) - must be declared before effects that reference it
  const loadEmailIdentities = useCallback(async () => {
    try {
      if (!selectedDomain) return;
      setIsLoadingEmailIdentities(true);
      setEmailIdentitiesError(null);
      const response = await apiFetch<{ identities: Array<{ email: string; domain: string; status: string }> }>(
        `email/identities?domain=${encodeURIComponent(selectedDomain)}`
      );
      const list = (response.identities || []).map((i) => ({ email: i.email, status: i.status }));
      setEmailIdentities(list);
    } catch (err: any) {
      setEmailIdentities([]);
      setEmailIdentitiesError(err?.message || 'Failed to load email identities');
    } finally {
      setIsLoadingEmailIdentities(false);
    }
  }, [selectedDomain]);

  // Format bytes into human-readable string
  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
  };

  const checkSSMAgentStatus = async (instanceId?: string): Promise<SSMAgentStatus> => {
    try {
      const targetInstanceId = instanceId ?? getSelectedInstanceId();
      if (!targetInstanceId) {
        console.warn('No instance ID available for SSM agent status check');
        throw new Error('No EC2 instance selected. Please select an instance from the dropdown above.');
      }
      const url = `domains/ssm-agent/status?instanceId=${encodeURIComponent(targetInstanceId)}`;
      console.log('Checking SSM agent status with instance ID:', targetInstanceId);
      const status = await apiFetch<SSMAgentStatus>(url);
      return status;
    } catch (err) {
      console.error('Failed to check SSM agent status', err);
      throw err; // Re-throw to let the caller handle it
    }
  };

  const installSSMAgent = async (instanceId?: string): Promise<{ commandId: string; status: string }> => {
    setInitializationMessage('Installing SSM agent...');
    const targetInstanceId = instanceId ?? getSelectedInstanceId();
    if (!targetInstanceId) {
      throw new Error('No EC2 instance selected. Please select an instance from the dropdown above.');
    }
    const url = `domains/ssm-agent/install?instanceId=${encodeURIComponent(targetInstanceId)}`;
    console.log('Installing SSM agent with instance ID:', targetInstanceId);
    const result = await apiFetch<{ commandId: string; status: string }>(url, {
      method: 'POST',
    });
    return result;
  };

  const startSSMAgent = async (instanceId?: string): Promise<{ commandId: string; status: string }> => {
    setInitializationMessage('Starting SSM agent...');
    const targetInstanceId = instanceId ?? getSelectedInstanceId();
    if (!targetInstanceId) {
      throw new Error('No EC2 instance selected. Please select an instance from the dropdown above.');
    }
    const url = `domains/ssm-agent/start?instanceId=${encodeURIComponent(targetInstanceId)}`;
    console.log('Starting SSM agent with instance ID:', targetInstanceId);
    const result = await apiFetch<{ commandId: string; status: string }>(url, {
      method: 'POST',
    });
    return result;
  };

  // Load quota for the currently selected domain using the accurate document root
  const loadDomainQuota = useCallback(async () => {
    try {
      if (!selectedDomain) return;
      const domainObj = serverInfo?.domains?.find((d) => d.domain === selectedDomain);
      if (!domainObj?.documentRoot) return;
      const instanceId = getSelectedInstanceId();
      if (!instanceId) return;
      setIsLoadingQuota(true);
      setQuotaError(null);
      const response = await apiFetch<{ domain: string; used: number }>(
        `domains/quota/${encodeURIComponent(domainObj.domain)}?documentRoot=${encodeURIComponent(domainObj.documentRoot)}&instanceId=${encodeURIComponent(instanceId)}`
      );
      setQuotaUsed(response.used ?? 0);
    } catch (err: any) {
      setQuotaError(err?.message || 'Failed to load quota');
      setQuotaUsed(null);
    } finally {
      setIsLoadingQuota(false);
    }
  }, [selectedDomain, serverInfo]);

  // Reload quota when domain selection, its document root, or tab changes to 'info'
  useEffect(() => {
    if (activeTab === 'info') {
      void loadDomainQuota();
    }
  }, [activeTab, loadDomainQuota]);

  // Load SES email identities when switching to Email tab or when domain changes
  useEffect(() => {
    if (activeTab === 'email' && selectedDomain) {
      void loadEmailIdentities();
    }
  }, [activeTab, selectedDomain, loadEmailIdentities]);

  const checkInstallationStatus = async (commandId: string, instanceId?: string): Promise<{ status: string; output?: string; error?: string }> => {
    const targetInstanceId = instanceId ?? getSelectedInstanceId();
    if (!targetInstanceId) {
      throw new Error('No EC2 instance selected. Please select an instance from the dropdown above.');
    }
    const url = `domains/ssm-agent/installation/${commandId}?instanceId=${encodeURIComponent(targetInstanceId)}`;
    const status = await apiFetch<{ status: string; output?: string; error?: string }>(url);
    return status;
  };

  const pollStartCommand = async (commandId: string) => {
    if (installationPollIntervalRef.current) {
      clearInterval(installationPollIntervalRef.current);
    }

    let commandCompleted = false;

    const poll = async () => {
      if (commandCompleted) {
        return;
      }

      try {
        const status = await checkInstallationStatus(commandId);
        
        if (status.status === 'Success') {
          commandCompleted = true;
          if (installationPollIntervalRef.current) {
            clearInterval(installationPollIntervalRef.current);
            installationPollIntervalRef.current = null;
          }
          
          setInitializationMessage('SSM agent started! Verifying agent status...');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          
          // Check if agent is now running
          const currentInstanceId = getSelectedInstanceId();
          const agentStatus = await checkSSMAgentStatus(currentInstanceId ?? undefined);
          setSsmAgentStatus(agentStatus);
          
          if (agentStatus.isInstalled && agentStatus.isRunning) {
            setInitializationMessage('SSM agent is ready!');
            isInitializingRef.current = false;
            setIsInitializing(false);
            void loadServerInfo();
          } else {
            // Still not running, try polling agent status
            void pollAgentStatus(6); // Give it 30 more seconds
          }
        } else if (status.status === 'Failed' || status.status === 'Cancelled' || status.status === 'TimedOut') {
          commandCompleted = true;
          setError(`SSM agent start command ${status.status.toLowerCase()}: ${status.error ?? 'Unknown error'}`);
          // Try one more time to check agent status
          const currentInstanceId = getSelectedInstanceId();
          try {
            const agentStatus = await checkSSMAgentStatus(currentInstanceId ?? undefined);
            setSsmAgentStatus(agentStatus);
            if (agentStatus.isInstalled && agentStatus.isRunning) {
              setInitializationMessage('SSM agent is ready!');
              isInitializingRef.current = false;
              setIsInitializing(false);
              void loadServerInfo();
              return;
            }
          } catch {
            // Ignore errors checking status
          }
          isInitializingRef.current = false;
          setIsInitializing(false);
          if (installationPollIntervalRef.current) {
            clearInterval(installationPollIntervalRef.current);
          }
        } else {
          // Still in progress
          setInitializationMessage('Starting SSM agent...');
        }
      } catch (err) {
        console.error('Failed to check start command status', err);
      }
    };

    installationPollIntervalRef.current = setInterval(poll, 3000);
    void poll();
  };

  const pollAgentStatus = async (maxAttempts = 12) => {
    // Poll agent status directly (not the installation command)
    let attempts = 0;
    
    const poll = async () => {
      if (attempts >= maxAttempts) {
        // Agent is installed but not running after multiple attempts - try to start it
        setInitializationMessage('SSM agent installed but not running. Attempting to start...');
        try {
          const currentInstanceId = getSelectedInstanceId();
          if (currentInstanceId) {
            const startResult = await startSSMAgent(currentInstanceId);
            // Poll the start command
            void pollStartCommand(startResult.commandId);
            return;
          }
        } catch (startErr) {
          console.error('Failed to start SSM agent', startErr);
          setError('SSM agent installation completed but agent did not start automatically. Please check the instance manually or try starting it again.');
          isInitializingRef.current = false;
          setIsInitializing(false);
          if (installationPollIntervalRef.current) {
            clearInterval(installationPollIntervalRef.current);
          }
          return;
        }
        
        setError('SSM agent installation completed but agent did not start within the expected time. Please check the instance manually.');
        isInitializingRef.current = false;
        setIsInitializing(false);
        if (installationPollIntervalRef.current) {
          clearInterval(installationPollIntervalRef.current);
        }
        return;
      }

      attempts++;
      try {
        const currentInstanceId = getSelectedInstanceId();
        if (!currentInstanceId) {
          setError('No EC2 instance selected.');
          isInitializingRef.current = false;
          setIsInitializing(false);
          if (installationPollIntervalRef.current) {
            clearInterval(installationPollIntervalRef.current);
          }
          return;
        }

        const newStatus = await checkSSMAgentStatus(currentInstanceId);
          setSsmAgentStatus(newStatus);
          
          if (newStatus.isInstalled && newStatus.isRunning) {
          setInitializationMessage('SSM agent is ready!');
          isInitializingRef.current = false;
            setIsInitializing(false);
            if (installationPollIntervalRef.current) {
              clearInterval(installationPollIntervalRef.current);
            }
            void loadServerInfo();
          } else {
          setInitializationMessage(`SSM agent installed but not running. Checking status... (attempt ${attempts}/${maxAttempts})`);
        }
      } catch (err) {
        console.error('Failed to check agent status', err);
        setInitializationMessage(`SSM agent installed but not running. Retrying... (attempt ${attempts}/${maxAttempts})`);
      }
    };

    // Poll every 5 seconds
    installationPollIntervalRef.current = setInterval(poll, 5000);
    void poll(); // Initial check
  };

  const pollInstallationStatus = async (commandId: string) => {
    if (installationPollIntervalRef.current) {
      clearInterval(installationPollIntervalRef.current);
    }

    let commandCompleted = false;

    const poll = async () => {
      if (commandCompleted) {
        return; // Stop polling if command already completed
      }

      try {
        const status = await checkInstallationStatus(commandId);
        
        if (status.status === 'Success') {
          commandCompleted = true;
          // Stop polling the installation command
          if (installationPollIntervalRef.current) {
            clearInterval(installationPollIntervalRef.current);
            installationPollIntervalRef.current = null;
          }
          
          setInitializationMessage('SSM agent installed successfully! Verifying agent status...');
          // Wait a bit for agent to fully start, then poll agent status directly
          await new Promise((resolve) => setTimeout(resolve, 3000));
          
          // Now poll the agent status instead of the installation command
          void pollAgentStatus();
        } else if (status.status === 'Failed' || status.status === 'Cancelled' || status.status === 'TimedOut') {
          commandCompleted = true;
          setError(`SSM agent installation ${status.status.toLowerCase()}: ${status.error ?? 'Unknown error'}`);
          isInitializingRef.current = false;
          setIsInitializing(false);
          if (installationPollIntervalRef.current) {
            clearInterval(installationPollIntervalRef.current);
          }
        } else {
          // Still in progress
          setInitializationMessage('Installing SSM agent... (this may take a few minutes)');
        }
      } catch (err) {
        console.error('Failed to check installation status', err);
        // Continue polling on error
      }
    };

    // Poll every 5 seconds
    installationPollIntervalRef.current = setInterval(poll, 5000);
    void poll(); // Initial check
  };

  const initializeSSMAgent = async () => {
    // Prevent multiple simultaneous initializations
    if (isInitializingRef.current) {
      console.log('SSM agent initialization already in progress, skipping...');
      return;
    }
    
    try {
      isInitializingRef.current = true;
      setIsInitializing(true);
      setInitializationMessage('Checking SSM agent status...');
      setError(null);

      // First, check if we have an instance ID
      const instanceId = getSelectedInstanceId();
      console.log('Initializing SSM agent, instance ID from localStorage:', instanceId);
      if (!instanceId) {
        setError('No EC2 instance selected. Please select an instance from the dropdown above.');
        setIsInitializing(false);
        return;
      }

      const status = await checkSSMAgentStatus(instanceId);
      setSsmAgentStatus(status);

      if (status.isInstalled && status.isRunning) {
        setInitializationMessage('SSM agent is ready!');
        isInitializingRef.current = false;
        setIsInitializing(false);
        void loadServerInfo();
      } else {
        // Agent not installed or not running
        // Try to install/start it via SSM (this will only work if agent is already partially installed)
        setInitializationMessage('SSM agent not responding. Attempting to install/start...');
        try {
          const installResult = await installSSMAgent(instanceId);
          
          setSsmAgentStatus({
            ...status,
            installationInProgress: true,
            installationCommandId: installResult.commandId,
          });

          // Start polling for installation status
          await pollInstallationStatus(installResult.commandId);
        } catch (installError) {
          // If installation fails, it likely means agent is completely missing
          const errorMessage = installError instanceof Error ? installError.message : String(installError);
          setError(
            `SSM agent is not installed on this instance. Cannot install via SSM. ` +
            `Please install the SSM agent via EC2 user-data/bootstrap script or EC2 Instance Connect. ` +
            `Error: ${errorMessage}`,
          );
          isInitializingRef.current = false;
          setIsInitializing(false);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize SSM agent';
      setError(message);
      isInitializingRef.current = false;
      setIsInitializing(false);
    }
  };

  const loadServerInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const instanceId = getSelectedInstanceId();
      const url = instanceId 
        ? `domains/server-info?instanceId=${encodeURIComponent(instanceId)}`
        : 'domains/server-info';
      const info = await apiFetch<ServerInfo>(url);
      setServerInfo(info);
      if (info.domains.length > 0 && !selectedDomain) {
        setSelectedDomain(info.domains[0].domain);
      }
      // Also load managed domains
      void loadManagedDomains();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load server information';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Use refreshDomains from the hook instead of loadManagedDomains
  const loadManagedDomains = async () => {
    await refreshManagedDomains();
  };

  const createDomain = async (input: { domain: string; documentRoot?: string; sslEnabled?: boolean }): Promise<void> => {
    const instanceId = getSelectedInstanceId();
    if (!instanceId) {
      throw new Error('No EC2 instance selected. Please select an instance from the dropdown above.');
    }

    setIsCreatingDomain(true);
    try {
      const url = `domains/domains?instanceId=${encodeURIComponent(instanceId)}`;
      await apiFetch<{ domain: any; commandId: string }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      // Reload domains after creation
      await loadManagedDomains();
      
      // Optionally poll for command completion (web server config setup)
      // For now, just reload domains
    } finally {
      setIsCreatingDomain(false);
    }
  };

  const handleDeleteDomainClick = (id: string, name: string) => {
    setDomainToDelete({ id, name });
    setDeleteModalOpen(true);
  };

  const deleteDomain = async () => {
    if (!domainToDelete) return;

    const url = `domains/domains/${encodeURIComponent(domainToDelete.id)}`;
    await apiFetch(url, {
      method: 'DELETE',
    });
    
    // Reload domains after deletion
    await loadManagedDomains();
    
    // Also reload server info to update domain list
    if (serverInfo) {
      void loadServerInfo();
    }

    // Clear the domain to delete and close modal
    setDomainToDelete(null);
    setDeleteModalOpen(false);
  };


  const installWebServer = async (config: {
    type: 'nginx' | 'apache';
    httpPort: number;
    httpsPort: number;
    phpVersion?: string;
    extras?: string;
    configureFirewall: boolean;
  }) => {
    try {
      setIsInstallingWebServer(true);
      setWebServerInstallProgress('Sending installation command...');
      setError(null);

      const instanceId = getSelectedInstanceId();
      if (!instanceId) {
        throw new Error('No EC2 instance selected.');
      }

      const url = `domains/web-server/install?instanceId=${encodeURIComponent(instanceId)}`;
      const result = await apiFetch<{ commandId: string; status: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      // Start polling installation status
      void pollWebServerInstallation(result.commandId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start web server installation';
      setError(message);
      setIsInstallingWebServer(false);
      setWebServerInstallProgress('');
    }
  };

  const pollWebServerInstallation = async (commandId: string) => {
    if (webServerInstallPollIntervalRef.current) {
      clearInterval(webServerInstallPollIntervalRef.current);
    }

    let commandCompleted = false;

    const poll = async () => {
      if (commandCompleted) {
        return;
      }

      try {
        const instanceId = getSelectedInstanceId();
        if (!instanceId) {
          setError('No EC2 instance selected.');
          setIsInstallingWebServer(false);
          setWebServerInstallProgress('');
          if (webServerInstallPollIntervalRef.current) {
            clearInterval(webServerInstallPollIntervalRef.current);
          }
          return;
        }

        const url = `domains/web-server/installation/${commandId}?instanceId=${encodeURIComponent(instanceId)}`;
        const status = await apiFetch<{ status: string; output?: string; error?: string }>(url);

        if (status.status === 'Success') {
          commandCompleted = true;
          setWebServerInstallProgress('Installation completed successfully!');
          setIsInstallingWebServer(false);
          
          if (webServerInstallPollIntervalRef.current) {
            clearInterval(webServerInstallPollIntervalRef.current);
          }

          // Wait a moment then reload server info
          await new Promise((resolve) => setTimeout(resolve, 2000));
          void loadServerInfo();
        } else if (status.status === 'Failed' || status.status === 'Cancelled' || status.status === 'TimedOut') {
          commandCompleted = true;
          setError(
            `Web server installation ${status.status.toLowerCase()}: ${status.error ?? 'Unknown error'}. Output: ${status.output ?? 'No output'}`,
          );
          setIsInstallingWebServer(false);
          setWebServerInstallProgress('');
          if (webServerInstallPollIntervalRef.current) {
            clearInterval(webServerInstallPollIntervalRef.current);
          }
        } else {
          // Still in progress - update progress message
          const lastLine = status.output?.split('\n').filter((l) => l.trim()).pop() ?? '';
          setWebServerInstallProgress(lastLine || 'Installing web server... (this may take a few minutes)');
        }
      } catch (err) {
        console.error('Failed to check web server installation status', err);
        setWebServerInstallProgress('Checking installation status...');
      }
    };

    // Poll every 3 seconds
    webServerInstallPollIntervalRef.current = setInterval(poll, 3000);
    void poll(); // Initial check
  };

  const uninstallWebServer = async () => {
    if (!serverInfo || serverInfo.webServer.type === 'none') {
      return;
    }

    try {
      setIsUninstallingWebServer(true);
      setWebServerUninstallProgress('Sending uninstallation command...');
      setError(null);

      const instanceId = getSelectedInstanceId();
      if (!instanceId) {
        throw new Error('No EC2 instance selected.');
      }

      const url = `domains/web-server/uninstall?instanceId=${encodeURIComponent(instanceId)}`;
      const result = await apiFetch<{ commandId: string; status: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: serverInfo.webServer.type }),
      });

      // Start polling uninstallation status
      void pollWebServerUninstallation(result.commandId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start web server uninstallation';
      setError(message);
      setIsUninstallingWebServer(false);
      setWebServerUninstallProgress('');
    }
  };

  const pollWebServerUninstallation = async (commandId: string) => {
    if (webServerUninstallPollIntervalRef.current) {
      clearInterval(webServerUninstallPollIntervalRef.current);
    }

    let commandCompleted = false;

    const poll = async () => {
      if (commandCompleted) {
        return;
      }

      try {
        const instanceId = getSelectedInstanceId();
        if (!instanceId) {
          setError('No EC2 instance selected.');
          setIsUninstallingWebServer(false);
          setWebServerUninstallProgress('');
          if (webServerUninstallPollIntervalRef.current) {
            clearInterval(webServerUninstallPollIntervalRef.current);
          }
          return;
        }

        const url = `domains/web-server/uninstallation/${commandId}?instanceId=${encodeURIComponent(instanceId)}`;
        const status = await apiFetch<{ status: string; output?: string; error?: string }>(url);

        if (status.status === 'Success') {
          commandCompleted = true;
          setWebServerUninstallProgress('Uninstallation completed successfully!');
          setIsUninstallingWebServer(false);
          
          if (webServerUninstallPollIntervalRef.current) {
            clearInterval(webServerUninstallPollIntervalRef.current);
          }

          // Wait a moment then reload server info
          await new Promise((resolve) => setTimeout(resolve, 2000));
          void loadServerInfo();
        } else if (status.status === 'Failed' || status.status === 'Cancelled' || status.status === 'TimedOut') {
          commandCompleted = true;
          setError(
            `Web server uninstallation ${status.status.toLowerCase()}: ${status.error ?? 'Unknown error'}. Output: ${status.output ?? 'No output'}`,
          );
          setIsUninstallingWebServer(false);
          setWebServerUninstallProgress('');
          if (webServerUninstallPollIntervalRef.current) {
            clearInterval(webServerUninstallPollIntervalRef.current);
          }
        } else {
          // Still in progress - update progress message
          const lastLine = status.output?.split('\n').filter((l) => l.trim()).pop() ?? '';
          setWebServerUninstallProgress(lastLine || 'Uninstalling web server... (this may take a few minutes)');
        }
      } catch (err) {
        console.error('Failed to check web server uninstallation status', err);
        setWebServerUninstallProgress('Checking uninstallation status...');
      }
    };

    // Poll every 3 seconds
    webServerUninstallPollIntervalRef.current = setInterval(poll, 3000);
    void poll(); // Initial check
  };

  // Guard: Check for instance ID on mount and when it changes
  useEffect(() => {
    const checkInstanceId = () => {
      const instanceId = getSelectedInstanceId();
      const hasId = !!instanceId;
      setHasInstanceId(hasId);
      
      if (hasId) {
        console.log('Instance ID available, initializing SSM agent:', instanceId);
        void initializeSSMAgent();
      } else {
        setError('No EC2 instance selected. Please select an instance from the dropdown above.');
        isInitializingRef.current = false;
        setIsInitializing(false);
      }
    };

    // Check immediately
    checkInstanceId();

    // Listen for instance selection changes
    const handleInstanceChange = () => {
      checkInstanceId();
    };

    // Listen for storage changes (when instance is selected in dropdown)
    window.addEventListener('storage', handleInstanceChange);
    
    // Also listen for custom event (in case storage event doesn't fire for same-origin)
    const customHandler = () => {
      // Small delay to ensure localStorage is updated
      setTimeout(handleInstanceChange, 100);
    };
    window.addEventListener('ec2-instance-selected', customHandler);

    return () => {
      window.removeEventListener('storage', handleInstanceChange);
      window.removeEventListener('ec2-instance-selected', customHandler);
      if (installationPollIntervalRef.current) {
        clearInterval(installationPollIntervalRef.current);
      }
      if (webServerInstallPollIntervalRef.current) {
        clearInterval(webServerInstallPollIntervalRef.current);
      }
      if (webServerUninstallPollIntervalRef.current) {
        clearInterval(webServerUninstallPollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      void loadDnsRecords();
      void loadSslCertificates();
    }
  }, [selectedDomain]);

  const loadDnsRecords = async () => {
    if (!selectedDomain) return;
    try {
      setIsLoadingDns(true);
      setDnsError(null);
      const records = await apiFetch<ZoneRecords>(`domains/dns/records/${selectedDomain}`);
      setDnsRecords(records);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load DNS records';
      setDnsError(message);
      setDnsRecords(null);
    } finally {
      setIsLoadingDns(false);
    }
  };

  const loadSslCertificates = async () => {
    try {
      setIsLoadingSsl(true);
      setSslError(null);
      const instanceId = getSelectedInstanceId();
      const params: string[] = [];
      if (instanceId) params.push(`instanceId=${encodeURIComponent(instanceId)}`);
      if (selectedDomain) params.push(`domain=${encodeURIComponent(selectedDomain)}`);
      const qs = params.length ? `?${params.join('&')}` : '';
      const response = await apiFetch<{ certificates: SSLCertificate[] }>(`domains/ssl/certificates${qs}`);
      setSslCertificates(response.certificates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load SSL certificates';
      setSslError(message);
      setSslCertificates([]);
    } finally {
      setIsLoadingSsl(false);
    }
  };

  /* removed duplicate loadEmailIdentities definition */

  // Guard: Block page if no instance ID is selected
  // Show loading state while checking, then show error if no instance
  if (hasInstanceId === null) {
    // Still checking for instance ID
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">EC2 Web Panel</h1>
          <p className="text-sm text-slate-400">Apache/Nginx Hosting</p>
        </header>
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-white">Checking instance selection...</p>
          </div>
        </div>
      </div>
    );
  }

  if (hasInstanceId === false) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">EC2 Web Panel</h1>
          <p className="text-sm text-slate-400">Apache/Nginx Hosting</p>
        </header>
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-6 py-8">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="rounded-full bg-amber-500/20 p-3">
              <Loader2 className="h-6 w-6 text-amber-400" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-amber-200">No EC2 Instance Selected</p>
              <p className="text-sm text-amber-300/80">
                Please select an EC2 instance from the dropdown in the top navigation bar to continue.
              </p>
              <p className="text-xs text-amber-400/60 mt-4">
                Once you select an instance, this page will automatically load.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">EC2 Web Panel</h1>
          <p className="text-sm text-slate-400">Apache/Nginx Hosting</p>
        </header>
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-white">Initializing</p>
            <p className="text-sm text-slate-400">{initializationMessage}</p>
            {ssmAgentStatus?.installationInProgress && (
              <p className="text-xs text-slate-500 mt-4">
                This may take a few minutes. Please wait...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">EC2 Web Panel</h1>
          <p className="text-sm text-slate-400">Apache/Nginx Hosting</p>
        </header>
        <div className="text-center py-12 text-slate-400">Loading server information...</div>
      </div>
    );
  }

  if (error || !serverInfo) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">EC2 Web Panel</h1>
          <p className="text-sm text-slate-400">Apache/Nginx Hosting</p>
        </header>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 py-8 text-sm text-rose-200">
          {error ?? 'Failed to load server information'}
        </div>
      </div>
    );
  }

  // Find current domain from either serverInfo.domains or managedDomains
  const currentDomain = serverInfo.domains.find((d) => d.domain === selectedDomain) 
    || managedDomains.find((d) => d.domain === selectedDomain)
    || (selectedDomain ? {
        domain: selectedDomain,
        serverBlock: selectedDomain,
        documentRoot: undefined,
        sslEnabled: false,
        configPath: '',
      } : null);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">EC2 Web Panel</h1>
            <p className="text-sm text-slate-400">Apache/Nginx Hosting</p>
          </div>
          
          {/* DNS Lookup Search - Aligned right, same width as details panel */}
          <div className="flex-1 max-w-none lg:max-w-[calc(100%-280px-1.5rem)]">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  id="dns-lookup-hostname"
                  type="text"
                  placeholder="domain lookup..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      const domain = e.currentTarget.value.trim();
                      // Validate domain before performing lookup
                      if (isValidDomainName(domain)) {
                        setDnsLookupError(null);
                        setDnsLookupDomain(domain);
                        setShowDnsLookupForm(true);
                        setActiveTab('dns');
                        setSelectedDomain(null);
                        setDnsLookupCompleted(false); // Reset completion state
                        setDnsLookupHasRecords(false); // Reset records state
                        e.currentTarget.value = '';
                        } else {
                          // Show error for invalid domain
                          setDnsLookupError('Please enter a valid domain name');
                        }
                    }
                  }}
                  onChange={() => {
                    // Clear error when user starts typing
                    if (dnsLookupError) {
                      setDnsLookupError(null);
                    }
                  }}
                  className={`w-full px-4 py-2 bg-slate-800 border rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${
                    dnsLookupError
                      ? 'border-rose-500 focus:ring-rose-500 focus:border-rose-500'
                      : 'border-slate-700 focus:ring-emerald-500 focus:border-transparent'
                  }`}
                />
                {dnsLookupError && (
                  <p className="mt-2 text-sm text-rose-400">{dnsLookupError}</p>
                )}
              </div>
              <div className="flex items-start">
                <button
                  onClick={(e) => {
                    const input = document.getElementById('dns-lookup-hostname') as HTMLInputElement;
                    if (input?.value.trim()) {
                      const domain = input.value.trim();
                      // Validate domain before performing lookup
                      if (isValidDomainName(domain)) {
                        setDnsLookupError(null);
                        setDnsLookupDomain(domain);
                        setShowDnsLookupForm(true);
                        setActiveTab('dns');
                        setSelectedDomain(null);
                        setDnsLookupCompleted(false); // Reset completion state
                        setDnsLookupHasRecords(false); // Reset records state
                        input.value = '';
                        } else {
                          // Show error for invalid domain
                          setDnsLookupError('Please enter a valid domain name');
                        }
                    }
                  }}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition flex items-center gap-2"
                >
                  <Search className="h-4 w-4" />
                  Lookup All Records
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Domain Sidebar */}
        <aside className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase px-2">Hosted Websites</h2>
            <button
              onClick={() => setIsAddDomainModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Add website"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          
          {/* Merge managed domains with detected domains from server config */}
          {(() => {
            // Convert managed domains to the format expected by the simple list
            // Filter to only include valid domain names
            const managedDomainNames = filterValidDomains(managedDomains.map(d => d.domain));
            const detectedDomainNames = filterValidDomains(serverInfo?.domains.map(d => d.domain) || []);
            
            // Combine both lists, removing duplicates (prioritize managed domains)
            // Filter again to ensure all are valid
            const allDomainNames = [...new Set([...managedDomainNames, ...detectedDomainNames])].filter(isValidDomainName);
            
            // If we have managed domains, show the full DomainList component
            if (managedDomains.length > 0 || isLoadingDomains) {
              return (
                <>
                  {isLoadingDomains && allDomainNames.length === 0 ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  ) : allDomainNames.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-sm">
                      <p>No websites configured yet.</p>
                      <p className="text-xs mt-1">Add a website to get started!</p>
                    </div>
                  ) : (
                    <ul className="space-y-1 max-h-[400px] overflow-auto">
                      {allDomainNames.map((domainName) => {
                        const isManaged = managedDomainNames.includes(domainName);
                        const managedDomain = managedDomains.find(d => d.domain === domainName);
                        const detectedDomain = serverInfo?.domains.find(d => d.domain === domainName);
                        // Use shared SSL status check (consistent with SSL page) - checks for active certificate status
                        const hasSsl = hasActiveCertificate(domainName);
                        const url = `${hasSsl ? 'https' : 'http'}://${domainName}`;
                        
                        return (
                          <li
                            key={domainName}
                            onClick={() => setSelectedDomain(domainName)}
                            className={`px-2 py-2 rounded-md hover:bg-slate-800 cursor-pointer transition text-sm flex items-center justify-between gap-2 ${
                              selectedDomain === domainName
                                ? 'bg-slate-800 text-white font-medium'
                                : 'text-slate-300'
                            }`}
                          >
                            <span className="truncate min-w-0 flex-1">{domainName}</span>
                            {hasSsl ? (
                              <Lock className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <Unlock className="h-4 w-4 text-rose-400 flex-shrink-0" />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              );
            } else if (serverInfo && serverInfo.domains.length > 0) {
              // Show simple list if only detected domains
              // Filter to only show valid domain names
              const validDetectedDomains = filterValidDomains(serverInfo.domains);
              
              if (validDetectedDomains.length === 0) {
                return (
                  <div className="text-center py-4 text-slate-400 text-sm">
                    <p>No valid websites found.</p>
                    <p className="text-xs mt-1">All detected domains have invalid names.</p>
                  </div>
                );
              }
              
              return (
                <ul className="space-y-1 max-h-[400px] overflow-auto">
                  {validDetectedDomains.map((domain) => {
                    // Use shared SSL status check (consistent with SSL page) - checks for active certificate status
                    const hasSsl = hasActiveCertificate(domain.domain);
                    const url = `${hasSsl ? 'https' : 'http'}://${domain.domain}`;
                    return (
                <li
                  key={domain.domain}
                  onClick={() => setSelectedDomain(domain.domain)}
                        className={`px-2 py-2 rounded-md hover:bg-slate-800 cursor-pointer transition text-sm flex items-center justify-between gap-2 ${
                    selectedDomain === domain.domain
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-300'
                  }`}
                >
                        <span className="truncate min-w-0 flex-1">{domain.domain}</span>
                          {hasSsl ? (
                            <Lock className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Unlock className="h-4 w-4 text-rose-400 flex-shrink-0" />
                          )}
                      </li>
                    );
                  })}
          </ul>
              );
            } else {
              // No domains at all
              return (
                <div className="text-center py-4 text-slate-400 text-sm">
                  <p>No websites configured yet.</p>
                  <p className="text-xs mt-1">Add a website to get started!</p>
                </div>
              );
            }
          })()}
          
          {/* Web Server Panel */}
          <div className="mt-6 pt-4 border-t border-slate-800">
            <WebServerInstallPanel
              webServerType={serverInfo.webServer.type}
              webServerVersion={serverInfo.webServer.version}
              isWebServerRunning={serverInfo.webServer.isRunning}
              onInstall={installWebServer}
              onUninstall={uninstallWebServer}
              isInstalling={isInstallingWebServer}
              isUninstalling={isUninstallingWebServer}
              installationProgress={webServerInstallProgress}
              uninstallationProgress={webServerUninstallProgress}
            />
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-1">
            <p>
              Instance: <span className="text-slate-200">{serverInfo.instanceId}</span>
            </p>
            <div>
              <p className="text-slate-400">Server:</p>
              <p className="text-slate-200">
                {serverInfo.webServer.type === 'none'
                  ? 'Not detected'
                  : `${serverInfo.webServer.type} ${serverInfo.webServer.version ?? ''}`}
            </p>
            </div>
            {serverInfo.publicIp && (
              <p>
                IP: <span className="text-slate-200">{serverInfo.publicIp}</span>
              </p>
            )}
          </div>
        </aside>

        {/* Main Panel */}
        <main className="flex flex-col bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between p-4 bg-slate-900/80 border-b border-slate-800">
            <div className="flex items-center gap-2">
              {currentDomain?.domain && (
                <>
                  {hasActiveCertificate(currentDomain.domain) ? (
                    <Lock className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Unlock className="h-5 w-5 text-rose-400 flex-shrink-0" />
                  )}
                </>
              )}
              {currentDomain?.domain ? (
                <>
                  {(() => {
                    const hasSsl = hasActiveCertificate(currentDomain.domain);
                    const url = `${hasSsl ? 'https' : 'http'}://${currentDomain.domain}`;
                    const isManaged = managedDomains.some(d => d.domain === currentDomain.domain);
                    const managedDomain = managedDomains.find(d => d.domain === currentDomain.domain);
                    
                    return (
                      <>
                        <h2
                          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                          className="text-lg font-semibold text-white cursor-pointer hover:text-emerald-400 transition-colors"
                          title="Click to visit website"
                        >
                          {currentDomain.domain}
                        </h2>
                        <button
                          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                          title="Visit website"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        {isManaged && managedDomain && (
                          <button
                            onClick={() => handleDeleteDomainClick(
                              managedDomain._id || managedDomain.domain,
                              managedDomain.domain
                            )}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                            title="Delete website"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <h2 className="text-lg font-semibold text-white">
                  {dnsLookupDomain ? `DNS Lookup: ${dnsLookupDomain}` : 'Select a website'}
                </h2>
              )}
            </div>
            {!showDnsLookupForm && (
              <button 
                onClick={() => {
                  // Focus the DNS lookup input at the top
                  setTimeout(() => {
                    const input = document.getElementById('dns-lookup-hostname') as HTMLInputElement;
                    input?.focus();
                  }, 100);
                }}
                className="bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-700 transition text-sm"
              >
                Domain lookup
              </button>
            )}
          </header>

          {(currentDomain && !showDnsLookupForm) || showDnsLookupForm ? (
            <>
              {/* Tabs - Only show if domain is selected and DNS lookup is not active */}
              {currentDomain && !showDnsLookupForm && (
                <div className="border-b border-slate-800 bg-slate-900/50">
                  <nav className="flex space-x-6 px-6">
                    <button
                      onClick={() => setActiveTab('info')}
                      className={`py-3 border-b-2 transition ${
                        activeTab === 'info'
                          ? 'border-emerald-600 font-medium text-emerald-400'
                          : 'border-transparent text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      Website Info
                    </button>
                    <button
                      onClick={() => setActiveTab('ssl')}
                      className={`py-3 border-b-2 transition ${
                        activeTab === 'ssl'
                          ? 'border-emerald-600 font-medium text-emerald-400'
                          : 'border-transparent text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      SSL Certificates
                    </button>
                    <button
                      onClick={() => setActiveTab('email')}
                      className={`py-3 border-b-2 transition ${
                        activeTab === 'email'
                          ? 'border-emerald-600 font-medium text-emerald-400'
                          : 'border-transparent text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      Identity (Email)
                    </button>
                    <button
                      onClick={() => setActiveTab('ftp')}
                      className={`py-3 border-b-2 transition ${
                        activeTab === 'ftp'
                          ? 'border-emerald-600 font-medium text-emerald-400'
                          : 'border-transparent text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      FTP Accounts
                    </button>
                    <button
                      onClick={() => {
                        setShowDnsLookupForm(true);
                        setActiveTab('dns');
                        setSelectedDomain(null);
                        setDnsLookupDomain(null);
                      }}
                      className={`py-3 border-b-2 transition ${
                        activeTab === 'dns'
                          ? 'border-emerald-600 font-medium text-emerald-400'
                          : 'border-transparent text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        DNS Lookup
                      </div>
                    </button>
                  </nav>
                </div>
              )}

              {/* Tab Content */}
              <section className="p-6 overflow-y-auto flex-1">
              {showDnsLookupForm && activeTab === 'dns' && selectedInstanceId && (
                <DNSLookupPanel 
                  key={`dns-lookup-${dnsLookupDomain || 'new'}`}
                  instanceId={selectedInstanceId}
                  initialHostname={dnsLookupDomain || undefined}
                  triggerLookup={dnsLookupDomain || undefined}
                  showDetailsByDefault={false}
                  hideSearchForm={true}
                  onLookupResults={(hasRecords, domain) => {
                    setDnsLookupHasRecords(hasRecords);
                    setDnsLookupCompleted(true);
                  }}
                  onBuyDomain={(domain) => {
                    setIsAddDomainModalOpen(true);
                  }}
                  managedDomains={managedDomains.map(d => d.domain)}
                />
              )}
              {!showDnsLookupForm && activeTab === 'info' && currentDomain && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">DNS Configuration</h3>
                      <button
                        onClick={loadDnsRecords}
                        disabled={isLoadingDns}
                        className="text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                      >
                        {isLoadingDns ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </span>
                        ) : (
                          'Refresh'
                        )}
                      </button>
                    </div>
                    {dnsError ? (
                      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {dnsError}
                      </div>
                    ) : isLoadingDns ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
                        Loading DNS records...
                      </div>
                    ) : dnsRecords ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-xs text-slate-400">
                          Zone: {dnsRecords.zoneName} (ID: {dnsRecords.zoneId})
                        </div>
                        <table className="w-full border-collapse text-sm">
                          <thead className="bg-slate-900/80">
                            <tr>
                              <th className="px-4 py-2 text-left text-slate-400 font-semibold">Record Type</th>
                              <th className="px-4 py-2 text-left text-slate-400 font-semibold">Name</th>
                              <th className="px-4 py-2 text-left text-slate-400 font-semibold">Value</th>
                              <th className="px-4 py-2 text-left text-slate-400 font-semibold">TTL</th>
                              <th className="px-4 py-2 text-right text-slate-400 font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {dnsRecords.records.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                                  No DNS records found
                                </td>
                              </tr>
                            ) : (
                              dnsRecords.records.map((record, idx) => (
                                <tr key={`${record.name}-${record.type}-${idx}`} className="hover:bg-slate-900/60">
                                  <td className="px-4 py-2 text-slate-200">{record.type}</td>
                                  <td className="px-4 py-2 text-slate-200">{record.name}</td>
                                  <td className="px-4 py-2 text-slate-300">
                                    {record.values.length > 1 ? (
                                      <div className="flex flex-col gap-1">
                                        {record.values.map((value, i) => (
                                          <span key={i}>{value}</span>
                                        ))}
                                      </div>
                                    ) : (
                                      record.values[0] ?? 'N/A'
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-slate-300">{record.ttl ?? 'N/A'}</td>
                                  <td className="px-4 py-2 text-right">
                                    <button
                                      type="button"
                                      className="text-rose-400 hover:text-rose-300 transition"
                                      title="Delete record"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                        <div className="px-4 py-3 bg-slate-900/80 border-t border-slate-800">
                          <button
                            type="button"
                            className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition"
                          >
                            <Plus className="h-4 w-4" />
                            Add DNS Record
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
                        No DNS zone found for this domain
                      </div>
                    )}
                  </div>

                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-white mb-2">Quota</h3>
                    {isLoadingQuota || quotaError || quotaUsed === null ? (
                      <p className="text-sm text-slate-400">
                        {isLoadingQuota ? 'Loading...' : 'No quota information available'}
                      </p>
                    ) : (
                      (() => {
                        const totalBytes = 10 * 1024 * 1024 * 1024; // 10 GB default
                        const pct = Math.max(0, Math.min(100, Math.round((quotaUsed / totalBytes) * 100)));
                        return (
                          <>
                    <div className="w-full bg-slate-800 rounded-full h-3 mb-2">
                              <div
                                className="bg-emerald-600 h-3 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                    </div>
                            <p className="text-sm text-slate-400">
                              {formatBytes(quotaUsed)} used of {formatBytes(totalBytes)} ({pct}%)
                            </p>
                          </>
                        );
                      })()
                    )}
                  </div>

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-white mb-2">Website Details</h3>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Used Space:</span>
                        <span className="text-slate-200">
                          {isLoadingQuota
                            ? 'Loading...'
                            : quotaError
                              ? 'N/A'
                              : quotaUsed !== null
                                ? `${formatBytes(quotaUsed)}`
                                : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Document Root:</span>
                        <span className="text-slate-200">{currentDomain.documentRoot ?? 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Config Path:</span>
                        <span className="text-slate-200">{currentDomain.configPath}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">SSL Enabled:</span>
                        <span className="text-slate-200">
                          {hasActiveCertificate(currentDomain.domain) ? 'Yes' : 'No'}
                        </span>
                      </div>
                      {currentDomain.sslCertificate && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">SSL Certificate:</span>
                          <span className="text-slate-200">{currentDomain.sslCertificate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!showDnsLookupForm && activeTab === 'ssl' && currentDomain && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">SSL Certificates</h3>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={loadSslCertificates}
                        disabled={isLoadingSsl}
                        className="text-sm text-slate-400 hover:text-slate-300 disabled:opacity-50"
                      >
                        {isLoadingSsl ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </span>
                        ) : (
                          'Refresh'
                        )}
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 transition text-sm"
                      >
                        <Plus className="h-4 w-4" />
                        Request Certificate
                      </button>
                    </div>
                  </div>

                  {sslError ? (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      {sslError}
                    </div>
                  ) : isLoadingSsl ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
                      Loading SSL certificates...
                    </div>
                  ) : sslCertificates.length === 0 ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400">
                      No SSL certificates found. Request a certificate to get started.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-slate-900/80">
                          <tr>
                            <th className="px-4 py-2 text-left text-slate-400 font-semibold">Domain</th>
                            <th className="px-4 py-2 text-left text-slate-400 font-semibold">Issuer</th>
                            <th className="px-4 py-2 text-left text-slate-400 font-semibold">Expiry Date</th>
                            <th className="px-4 py-2 text-left text-slate-400 font-semibold">Status</th>
                            <th className="px-4 py-2 text-left text-slate-400 font-semibold">Certificate Path</th>
                            <th className="px-4 py-2 text-right text-slate-400 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {sslCertificates.map((cert) => {
                            const isExpiringSoon = cert.daysUntilExpiry !== undefined && cert.daysUntilExpiry < 30;
                            const isExpired = cert.daysUntilExpiry !== undefined && cert.daysUntilExpiry < 0;

                            return (
                              <tr key={cert.domain} className="hover:bg-slate-900/60">
                                <td className="px-4 py-2 text-slate-200">
                                  {cert.isWildcard && <span className="text-slate-400 mr-1">*</span>}
                                  {cert.domain}
                                </td>
                                <td className="px-4 py-2 text-slate-300">{cert.issuer ?? 'N/A'}</td>
                                <td className="px-4 py-2 text-slate-300">
                                  {cert.expiryDate ? (
                                    <div>
                                      <div>{cert.expiryDate}</div>
                                      {cert.daysUntilExpiry !== undefined && (
                                        <div
                                          className={`text-xs ${
                                            isExpired
                                              ? 'text-rose-400'
                                              : isExpiringSoon
                                                ? 'text-amber-400'
                                                : 'text-slate-500'
                                          }`}
                                        >
                                          {isExpired
                                            ? 'Expired'
                                            : `${cert.daysUntilExpiry} days remaining`}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    'N/A'
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${
                                      isExpired
                                        ? 'bg-rose-500/10 text-rose-200 border-rose-500/40'
                                        : isExpiringSoon
                                          ? 'bg-amber-500/10 text-amber-200 border-amber-500/40'
                                          : 'bg-emerald-500/10 text-emerald-200 border-emerald-500/40'
                                    }`}
                                  >
                                    {isExpired ? 'Expired' : isExpiringSoon ? 'Expiring Soon' : 'Valid'}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-slate-300 text-xs font-mono">
                                  {cert.certificatePath}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <button
                                    type="button"
                                    className="text-rose-400 hover:text-rose-300 transition"
                                    title="Delete certificate"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {!showDnsLookupForm && activeTab === 'email' && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Email Identity</h3>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-slate-400 text-sm">
                        Showing identities for: <span className="text-slate-200 font-mono">{selectedDomain}</span>
                  </div>
                      <button
                        onClick={() => void loadEmailIdentities()}
                        className="text-sm text-slate-400 hover:text-slate-300"
                        disabled={isLoadingEmailIdentities}
                      >
                        {isLoadingEmailIdentities ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </span>
                        ) : (
                          'Refresh'
                        )}
                      </button>
                    </div>
                    {emailIdentitiesError ? (
                      <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                        {emailIdentitiesError}
                      </div>
                    ) : isLoadingEmailIdentities ? (
                      <div className="text-slate-400 text-sm">Loading identities...</div>
                    ) : emailIdentities.length === 0 ? (
                      <div className="text-slate-400 text-sm">No SES identities found for this domain.</div>
                    ) : (
                      <ul className="space-y-1 max-h-[300px] overflow-auto">
                        {emailIdentities.map((i) => (
                          <li key={i.email} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-slate-800">
                            <span className="text-slate-200">{i.email}</span>
                            <span
                              className={`text-xs ${
                                i.status === 'Verified'
                                  ? 'text-emerald-400'
                                  : i.status === 'Failed'
                                  ? 'text-rose-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {i.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {!showDnsLookupForm && activeTab === 'ftp' && currentDomain && (
                <FtpAccountsPanel
                  domain={currentDomain.domain}
                  instanceId={getSelectedInstanceId() || ''}
                />
              )}

              </section>
            </>
          ) : (
            <section className="p-6 flex-1 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <p className="text-lg mb-2">No website selected</p>
                <p className="text-sm">Select a website from the sidebar to view details</p>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Add Domain Modal */}
      <AddDomainModal
        isOpen={isAddDomainModalOpen}
        onClose={() => setIsAddDomainModalOpen(false)}
        onAdd={createDomain}
        instanceId={getSelectedInstanceId() ?? undefined}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDomainToDelete(null);
        }}
        onConfirm={deleteDomain}
        title="Delete Website"
        message={
          domainToDelete
            ? `Are you sure you want to delete ${domainToDelete.name}? This action will permanently delete the Route53 hosted zone, all DNS records, the web server configuration, and all domain files from the server. This action cannot be undone.`
            : 'Are you sure you want to delete this website?'
        }
        confirmText="Delete Website"
        itemName={domainToDelete?.name}
        requireTypeToConfirm={true}
      />
    </div>
  );
}

