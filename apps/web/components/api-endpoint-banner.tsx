"use client";

import type { ServerSettings } from '@hosting/common';
import { Menu, Transition } from '@headlessui/react';
import { Check, ChevronDown, Loader2, Play, Square, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';

interface Ec2Instance {
  instanceId: string;
  name: string | null;
  state: string;
  instanceType: string;
  privateIpAddress: string | null;
  publicIpAddress: string | null;
  securityGroupIds: string[];
  subnetId: string | null;
  vpcId: string | null;
  hasIamRole: boolean;
}

interface Ec2InstancesResponse {
  items: Ec2Instance[];
}

interface AutoConfigureResponse {
  success: boolean;
  securityGroupId: string | null;
  networkAclId: string | null;
  instanceId?: string;
  message?: string;
}

interface InstanceActionResponse {
  success: boolean;
  message?: string;
}

const STORAGE_KEY = 'hosting-control-panel:selected-ec2-instance';

const getWindow = () =>
  typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
    ? ((globalThis as Record<string, unknown>).window as Window)
    : undefined;

const getStoredInstanceId = (): string => {
  const win = getWindow();
  if (!win) return '';
  try {
    const storage = (win as Window & { localStorage?: Storage }).localStorage;
    if (!storage) return '';
    return storage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

const setStoredInstanceId = (instanceId: string): void => {
  const win = getWindow();
  if (!win) return;
  try {
    const storage = (win as Window & { localStorage?: Storage }).localStorage;
    if (!storage) return;
    if (instanceId) {
      storage.setItem(STORAGE_KEY, instanceId);
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }
};

const getStatusColor = (state: string): string => {
  switch (state.toLowerCase()) {
    case 'running':
      return 'bg-green-500';
    case 'stopped':
      return 'bg-red-500';
    case 'stopping':
    case 'starting':
      return 'bg-orange-400';
    default:
      return 'bg-gray-400';
  }
};

export function ApiEndpointBanner() {
  const [instances, setInstances] = useState<Ec2Instance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasWindow, setHasWindow] = useState(false);
  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleInstanceSelect = async (instanceId: string) => {
    if (!instanceId) {
      setSelectedInstanceId('');
      setStoredInstanceId('');
      return;
    }

    // Update selection immediately and persist to localStorage
    setSelectedInstanceId(instanceId);
    setStoredInstanceId(instanceId);
    
    // Dispatch custom event for other components (like domains page)
    const win = getWindow();
    if (win && typeof win.dispatchEvent === 'function') {
      win.dispatchEvent(new CustomEvent('ec2-instance-selected', { detail: { instanceId } }));
    }
    
    setIsConfiguring(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await apiFetch<AutoConfigureResponse>('firewall/auto-configure', {
        method: 'POST',
        body: JSON.stringify({ instanceId }),
      });

      if (result.success) {
        setSuccess(
          `Configured firewall settings from instance ${instanceId}. Security Group: ${result.securityGroupId ?? 'N/A'}, Network ACL: ${result.networkAclId ?? 'N/A'}`,
        );
        // Dispatch event to refresh firewall settings
        const win = getWindow();
        if (win) {
          (win as any).dispatchEvent?.(new CustomEvent('firewall-settings-updated'));
        }
      } else {
        setError(result.message ?? 'Auto-configuration failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to configure firewall settings';
      setError(message);
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleInstanceClick = (instanceId: string) => {
    void handleInstanceSelect(instanceId);
  };

  const hasTransitionalInstances = (instancesList: Ec2Instance[]): boolean => {
    const transitionalStates = ['starting', 'stopping', 'pending'];
    return instancesList.some((inst) => transitionalStates.includes(inst.state.toLowerCase()));
  };

  const startPolling = () => {
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll every 3 seconds
    pollingIntervalRef.current = setInterval(() => {
      void loadInstances();
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const handleInstanceAction = async (instanceId: string, action: 'start' | 'stop' | 'terminate') => {
    setActionLoading((prev) => ({ ...prev, [instanceId]: true }));
    setError(null);
    setSuccess(null);

    try {
      const result = await apiFetch<InstanceActionResponse>(`firewall/instances/${instanceId}/${action}`, {
        method: 'POST',
      });

      if (result.success) {
        setSuccess(`Instance ${action} action initiated successfully`);
        // Reload instances immediately to get updated state
        // loadInstances will automatically start/stop polling based on instance states
        await loadInstances();
      } else {
        setError(result.message ?? `${action} action failed`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${action} instance`;
      setError(message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [instanceId]: false }));
    }
  };

  const getSelectedInstance = (): Ec2Instance | undefined => {
    return instances.find((inst) => inst.instanceId === selectedInstanceId);
  };

  const getDisplayName = (instance: Ec2Instance): string => {
    return instance.name || instance.instanceId;
  };

  const loadInstances = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load all instances
      const response = await apiFetch<Ec2InstancesResponse>('firewall/instances');
      setInstances(response.items);

      // Determine which instance to select (priority order):
      // 1. Stored instance ID from localStorage
      // 2. Current EC2 instance (if running on EC2)
      let instanceToSelect: string | null = null;
      
      // Try stored instance first
      const storedInstanceId = getStoredInstanceId();
      if (storedInstanceId) {
        const storedExists = response.items.some((inst) => inst.instanceId === storedInstanceId);
        if (storedExists) {
          instanceToSelect = storedInstanceId;
        }
      }
      
      // Fallback to current EC2 instance if no stored selection
      if (!instanceToSelect) {
        try {
          const currentInstanceResponse = await apiFetch<{ instanceId: string | null }>('firewall/current-instance');
          const currentInstanceId = currentInstanceResponse.instanceId;
          if (currentInstanceId) {
            const currentExists = response.items.some((inst) => inst.instanceId === currentInstanceId);
            if (currentExists) {
              instanceToSelect = currentInstanceId;
              // Store it for next time
              setStoredInstanceId(currentInstanceId);
            }
          }
        } catch (err) {
          // Ignore errors - might not be running on EC2
          console.debug('Not running on EC2 or failed to get current instance ID', err);
        }
      }

      // Update selection if we found a valid instance
      if (instanceToSelect && instanceToSelect !== selectedInstanceId) {
        setSelectedInstanceId(instanceToSelect);
        
        // Auto-configure only if:
        // 1. It's the current EC2 instance
        // 2. Firewall settings are not configured
        if (instanceToSelect) {
          try {
            const currentInstanceResponse = await apiFetch<{ instanceId: string | null }>('firewall/current-instance');
            const currentInstanceId = currentInstanceResponse.instanceId;
            if (instanceToSelect === currentInstanceId) {
              const firewallSettings = await apiFetch<{ securityGroupId: string | null; networkAclId: string | null }>('firewall/settings');
              if (!firewallSettings.securityGroupId && !firewallSettings.networkAclId) {
                // Auto-configure with the current instance
                void handleInstanceSelect(instanceToSelect);
              }
            }
          } catch (err) {
            // Ignore
          }
        }
      } else if (!instanceToSelect && selectedInstanceId) {
        // Clear selection if stored instance no longer exists
        setSelectedInstanceId('');
        setStoredInstanceId('');
      }

      // Check if we need to start or stop polling based on instance states
      if (hasTransitionalInstances(response.items)) {
        startPolling();
      } else {
        stopPolling();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load EC2 instances';
      setError(message);
      console.error('Failed to load EC2 instances', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const win = getWindow();
    if (!win) {
      return;
    }
    setHasWindow(true);
    
    // Load stored instance ID from localStorage
    const stored = getStoredInstanceId();
    if (stored) {
      setSelectedInstanceId(stored);
    }
    
    loadInstances();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const settings = await apiFetch<ServerSettings>('settings/server');
        if (controller.signal.aborted) return;
        setServerSettings(settings);
        // Reload instances when server settings change (credentials might have been updated)
        void loadInstances();
      } catch (error) {
        console.warn('Failed to load server settings', error);
      }
    })();
    return () => controller.abort();
  }, []);

  // Listen for server settings updates from the AWS settings modal
  useEffect(() => {
    const handleSettingsUpdate = () => {
      void loadInstances();
      const controller = new AbortController();
      (async () => {
        try {
          const settings = await apiFetch<ServerSettings>('settings/server');
          if (controller.signal.aborted) return;
          setServerSettings(settings);
        } catch (error) {
          console.warn('Failed to load server settings', error);
        }
      })();
    };
    
    const win = typeof window !== 'undefined' ? window : null;
    if (win) {
      win.addEventListener('server-settings-saved', handleSettingsUpdate);
      return () => {
        win.removeEventListener('server-settings-saved', handleSettingsUpdate);
      };
    }
    return undefined;
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const containsWindow = () => getWindow() !== undefined;

  if (!hasWindow || !containsWindow()) {
    return null;
  }

  const selectedInstance = getSelectedInstance();

  return (
    <>
      <div className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 px-4 py-3 text-xs text-slate-300 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-100">EC2 Instance:</span>
            <Menu as="div" className="relative inline-block text-left">
              <Menu.Button
                disabled={isLoading || isConfiguring}
                className="inline-flex w-64 justify-between rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-200 shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="truncate">
                  {isLoading
                    ? 'Loading instances...'
                    : selectedInstance
                      ? `${getDisplayName(selectedInstance)}${selectedInstance.publicIpAddress ? ` - ${selectedInstance.publicIpAddress}` : ''}`
                      : 'Select an EC2 instance'}
                </span>
                                <ChevronDown className="-mr-1 ml-2 h-4 w-4" fill="currentColor" aria-hidden="true" />
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute left-0 z-50 mt-2 w-80 origin-top-left rounded-md bg-slate-900 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    {instances.length === 0 ? (
                      <div className="px-4 py-2 text-xs text-slate-400">
                        {isLoading ? 'Loading instances...' : 'No instances found'}
                      </div>
                    ) : (
                      instances.map((instance) => {
                        const displayName = getDisplayName(instance);
                        const statusColor = getStatusColor(instance.state);
                        const isActionLoading = actionLoading[instance.instanceId] || false;
                        const isSelected = instance.instanceId === selectedInstanceId;

                        return (
                          <Menu.Item key={instance.instanceId}>
                            {({ active }) => (
                              <div
                                className={`flex items-center justify-between px-4 py-2 ${
                                  active ? 'bg-slate-800' : ''
                                } ${isSelected ? 'bg-slate-800/50' : ''}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleInstanceClick(instance.instanceId)}
                                  className="flex flex-1 items-start space-x-3 text-left"
                                >
                                  <span className={`inline-block h-3 w-3 rounded-full ${statusColor} mt-1`} />
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      {instance.hasIamRole && (
                                        <span title="IAM role attached">
                                          <Check className="h-3 w-3 text-emerald-400" />
                                        </span>
                                      )}
                                      <span className="text-xs text-slate-200">{displayName}</span>
                                    </div>
                                    {instance.publicIpAddress && (
                                      <span className="text-xs text-slate-400">{instance.publicIpAddress}</span>
                                    )}
                                    <span className="text-xs text-slate-500">
                                      {instance.instanceType}
                                      {instance.state !== 'running' && ` • ${instance.state}`}
                                    </span>
                                  </div>
                                </button>
                                <div className="flex items-center space-x-2">
                                  {instance.state === 'running' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleInstanceAction(instance.instanceId, 'stop');
                                      }}
                                      disabled={isActionLoading}
                                      className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Stop"
                                    >
                                      {isActionLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Square className="h-4 w-4" fill="currentColor" />
                                      )}
                                    </button>
                                  )}
                                  {instance.state === 'stopped' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleInstanceAction(instance.instanceId, 'start');
                                      }}
                                      disabled={isActionLoading}
                                      className="text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Start"
                                    >
                                      {isActionLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Play className="h-4 w-4" fill="currentColor" />
                                      )}
                                    </button>
                                  )}
                                  {(instance.state === 'starting' || instance.state === 'stopping') && (
                                    <span className="text-xs italic text-orange-400">Processing...</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Are you sure you want to terminate instance ${displayName}? This action cannot be undone.`)) {
                                        void handleInstanceAction(instance.instanceId, 'terminate');
                                      }
                                    }}
                                    disabled={isActionLoading}
                                    className="text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Terminate"
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                          </Menu.Item>
                        );
                      })
                    )}
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
            {isConfiguring && (
              <span className="text-xs text-slate-400">Configuring...</span>
            )}
            {serverSettings?.name ? (
              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {serverSettings.name}
              </span>
            ) : null}
          </div>
          {error ? (
            <p className="mt-1 text-xs text-rose-400">{error}</p>
          ) : success ? (
            <p className="mt-1 text-xs text-emerald-400">{success}</p>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-3 text-sm text-slate-300 sm:mt-0">
          <span>admin@example.com</span>
          <button className="rounded-md border border-slate-700 px-3 py-1.5 text-xs uppercase tracking-wide text-slate-200 transition hover:border-slate-500">
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

