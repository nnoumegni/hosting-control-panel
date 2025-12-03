"use client";

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { gatewayApi } from '../../../../../lib/gateway-api';
import { getSelectedInstanceId } from '../../../../../lib/instance-utils';
import type { AIConfig, AIConfigUpdate } from '@hosting/common';

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Supported AI providers (OpenAI SDK compatible)
const AI_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
    ],
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-pro', name: 'Gemini Pro' },
      { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' },
    ],
  },
  {
    id: 'custom',
    name: 'Custom / Self-hosted',
    baseUrl: '',
    models: [
      { id: 'custom', name: 'Custom Model' },
    ],
  },
] as const;

// Rule refresh interval options (in minutes)
const REFRESH_INTERVALS = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
] as const;

export function AIConfigModal({ isOpen, onClose }: AIConfigModalProps) {
  // Get selected instance ID using the same pattern as other dashboard components
  const instanceId = useMemo(() => getSelectedInstanceId(), []);

  const [config, setConfig] = useState<AIConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<AIConfigUpdate>({
    enabled: true, // Enabled by default
    baseUrl: '',
    apiKey: '',
    model: '',
    refreshSeconds: 900, // 15 minutes default
  });

  // Selected provider and available models
  const [selectedProviderId, setSelectedProviderId] = useState<string>('openai');
  const [isValidating, setIsValidating] = useState(false);

  // Load config when modal opens
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    } else {
      // Reset state when modal closes
      setConfig(null);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const loadConfig = async () => {
    if (!instanceId) {
      setError('No EC2 instance selected. Please select an instance from the dropdown above.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const aiConfig = await gatewayApi.getAIConfig(instanceId);
      setConfig(aiConfig);
      
      // Determine which provider matches the base URL
      const provider = AI_PROVIDERS.find(p => p.baseUrl === aiConfig.baseUrl);
      if (provider) {
        setSelectedProviderId(provider.id);
      } else {
        // Custom provider if base URL doesn't match any known provider
        setSelectedProviderId('custom');
      }
      
      const selectedProvider = provider || AI_PROVIDERS.find(p => p.id === 'custom') || AI_PROVIDERS[0];
      
      setFormData({
        enabled: aiConfig.enabled ?? true, // Default to enabled
        baseUrl: aiConfig.baseUrl || selectedProvider.baseUrl,
        apiKey: '', // Don't populate API key (it's masked)
        model: aiConfig.model || (selectedProvider.models[0]?.id || ''),
        refreshSeconds: aiConfig.refreshSeconds || 900,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI configuration');
      console.error('Error loading AI config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Get available models for selected provider
  const availableModels = useMemo(() => {
    const provider = AI_PROVIDERS.find(p => p.id === selectedProviderId);
    return provider?.models || [];
  }, [selectedProviderId]);

  // Get selected provider
  const selectedProvider = useMemo(() => {
    return AI_PROVIDERS.find(p => p.id === selectedProviderId) || AI_PROVIDERS[0];
  }, [selectedProviderId]);

  // Handle provider change
  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (provider) {
      setFormData(prev => ({
        ...prev,
        baseUrl: provider.baseUrl,
        model: provider.models[0]?.id || '',
      }));
    }
  };

  // Validate credentials by making a test API call
  const validateCredentials = async (baseUrl: string, apiKey: string, model: string): Promise<boolean> => {
    if (!apiKey || !baseUrl || !model) {
      return false;
    }

    try {
      // Make a minimal chat completion request to validate credentials
      // This works with OpenAI-compatible APIs
      const testUrl = `${baseUrl}/v1/chat/completions`;
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: 'test' }
          ],
          max_tokens: 5,
        }),
      });

      // Check for authentication errors
      if (response.status === 401 || response.status === 403) {
        return false;
      }

      // For some providers, we might get a 400 with a specific error about the model
      // but that still means the credentials are valid
      if (response.status === 400) {
        const errorBody = await response.json().catch(() => null);
        // If it's a model error (not auth error), credentials are valid
        if (errorBody?.error?.message && 
            (errorBody.error.message.includes('model') || 
             errorBody.error.message.includes('Model'))) {
          return true;
        }
        return false;
      }

      // If we get a 200 or other success status, credentials are valid
      return response.ok;
    } catch (error) {
      console.error('Credential validation error:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!instanceId) {
      setError('No EC2 instance selected. Please select an instance from the dropdown above.');
      return;
    }

    // Validate required fields
    if (!formData.baseUrl) {
      setError('Please select an AI provider.');
      return;
    }

    if (!formData.model) {
      setError('Please select a model.');
      return;
    }

    // Validate credentials if API key is provided (or if it's a new configuration)
    if (formData.apiKey || !config?.apiKey || config.apiKey === '***masked***') {
      if (!formData.apiKey && (!config?.apiKey || config.apiKey === '***masked***')) {
        setError('API key is required.');
        return;
      }

      setIsValidating(true);
      setError(null);
      
      try {
        const isValid = await validateCredentials(
          formData.baseUrl,
          formData.apiKey || '',
          formData.model
        );

        if (!isValid) {
          setError('Invalid API credentials. Please check your API key and try again.');
          setIsValidating(false);
          return;
        }
      } catch (err) {
        setError('Failed to validate credentials. Please check your API key and network connection.');
        setIsValidating(false);
        return;
      } finally {
        setIsValidating(false);
      }
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Prepare update data - use defaults for temperature and maxTokens
      const updateData: AIConfigUpdate = {
        enabled: formData.enabled ?? true,
        baseUrl: formData.baseUrl,
        model: formData.model,
        refreshSeconds: formData.refreshSeconds,
        // Set defaults: temperature = 0, maxTokens = 0 (no limit)
        temperature: 0,
        maxTokens: 0,
      };

      // Only include API key if it's being changed
      if (formData.apiKey) {
        updateData.apiKey = formData.apiKey;
      }

      const response = await gatewayApi.updateAIConfig(instanceId, updateData);
      setSuccess(response.message || 'AI configuration updated successfully');
      
      // Reload config to get updated values
      await loadConfig();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update AI configuration');
      console.error('Error updating AI config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof AIConfigUpdate, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                    AI Configuration Wizard
                  </Dialog.Title>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-300 transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-slate-400 mb-6">
                  Configure AI-powered threat detection
                </p>

                {!instanceId ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Please select an EC2 instance from the dropdown above to configure AI settings.
                  </div>
                ) : isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                    <span className="ml-3 text-slate-400">Loading configuration...</span>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Error/Success Messages */}
                    {error && (
                      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                        {success}
                      </div>
                    )}

                    {/* Enabled Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-800 bg-slate-900/50">
                      <div>
                        <label className="text-sm font-medium text-white">Enable AI Threat Detection</label>
                        <p className="text-xs text-slate-400 mt-1">
                          Automatically generate firewall rules based on traffic analysis
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.enabled ?? true}
                          onChange={(e) => handleInputChange('enabled', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                      </label>
                    </div>

                    {/* Provider Selection */}
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        AI Provider
                      </label>
                      <select
                        value={selectedProviderId}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      >
                        {AI_PROVIDERS.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400 mt-1">
                        Select your AI provider. The base URL will be set automatically.
                      </p>
                      {selectedProviderId === 'custom' && (
                        <input
                          type="text"
                          value={formData.baseUrl || ''}
                          onChange={(e) => handleInputChange('baseUrl', e.target.value)}
                          placeholder="https://your-custom-api.com"
                          className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        />
                      )}
                    </div>

                    {/* API Key */}
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={formData.apiKey || ''}
                        onChange={(e) => handleInputChange('apiKey', e.target.value)}
                        placeholder={config?.apiKey === '***masked***' ? 'Enter new API key (leave blank to keep current)' : 'Enter API key'}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        {config?.apiKey === '***masked***' 
                          ? 'Current API key is set. Leave blank to keep it unchanged.'
                          : 'Your AI API key (will be stored securely)'}
                      </p>
                    </div>

                    {/* Model */}
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Model
                      </label>
                      {selectedProviderId === 'custom' ? (
                        <input
                          type="text"
                          value={formData.model || ''}
                          onChange={(e) => handleInputChange('model', e.target.value)}
                          placeholder="Enter model name"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        />
                      ) : (
                        <select
                          value={formData.model || ''}
                          onChange={(e) => handleInputChange('model', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        >
                          {availableModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {selectedProviderId === 'custom' 
                          ? 'Enter the model identifier for your custom provider'
                          : `Select a model from the available options for ${selectedProvider.name}`}
                      </p>
                    </div>

                    {/* Refresh Interval */}
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Rule Refresh Interval
                      </label>
                      <select
                        value={formData.refreshSeconds ? formData.refreshSeconds / 60 : 15}
                        onChange={(e) => handleInputChange('refreshSeconds', parseInt(e.target.value, 10) * 60)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      >
                        {REFRESH_INTERVALS.map((interval) => (
                          <option key={interval.value} value={interval.value}>
                            {interval.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400 mt-1">
                        How often to regenerate AI rules based on traffic analysis
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:bg-slate-800/60 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving || isValidating}
                        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Validating...
                          </>
                        ) : isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save Configuration
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

