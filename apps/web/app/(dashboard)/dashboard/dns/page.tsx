"use client";

import { useState, useEffect } from 'react';
import { Search, AlertTriangle, FileText, Activity } from 'lucide-react';
import { getSelectedInstanceId } from '../../../../lib/instance-utils';
import { DNSLookupPanel } from './_components/dns-lookup-panel';
import { DNSDiagnosticsPanel } from './_components/dns-diagnostics-panel';
import { BatchValidationPanel } from './_components/batch-validation-panel';

export default function DNSPage() {
  const [instanceId, setInstanceId] = useState<string | null>(() => getSelectedInstanceId());
  const [activeTab, setActiveTab] = useState<'lookup' | 'diagnostics' | 'batch'>('lookup');

  // Listen for instance changes
  useEffect(() => {
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
  }, []);

  if (!instanceId) {
    return (
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-white">DNS Management</h1>
          <p className="text-sm text-slate-400">DNS lookup, diagnostics, and validation tools</p>
        </header>
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-6 py-8">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="rounded-full bg-amber-500/20 p-3">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-amber-200">No EC2 Instance Selected</p>
              <p className="text-sm text-amber-300/80">
                Please select an EC2 instance from the dropdown in the top navigation bar to continue.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">DNS Management</h1>
        <p className="text-sm text-slate-400">DNS lookup, diagnostics, and validation tools powered by agent DNS resolver</p>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/50 rounded-t-xl">
        <nav className="flex space-x-6 px-6">
          <button
            onClick={() => setActiveTab('lookup')}
            className={`py-3 border-b-2 transition ${
              activeTab === 'lookup'
                ? 'border-emerald-600 font-medium text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              DNS Lookup
            </div>
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`py-3 border-b-2 transition ${
              activeTab === 'diagnostics'
                ? 'border-emerald-600 font-medium text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Diagnostics
            </div>
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`py-3 border-b-2 transition ${
              activeTab === 'batch'
                ? 'border-emerald-600 font-medium text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Batch Validation
            </div>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-slate-900/60 rounded-b-xl border border-slate-800 border-t-0 overflow-hidden">
        {activeTab === 'lookup' && (
          <div className="p-6">
            <DNSLookupPanel instanceId={instanceId} />
          </div>
        )}
        {activeTab === 'diagnostics' && (
          <div className="p-6">
            <DNSDiagnosticsPanel instanceId={instanceId} />
          </div>
        )}
        {activeTab === 'batch' && (
          <div className="p-6">
            <BatchValidationPanel instanceId={instanceId} />
          </div>
        )}
      </div>
    </div>
  );
}

