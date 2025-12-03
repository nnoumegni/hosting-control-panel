"use client";

import { CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';

interface Requirement {
  id: string;
  name: string;
  description: string;
  status: 'completed' | 'in-progress' | 'pending' | 'blocked';
  category: string;
}

const requirements: Requirement[] = [
  // Gateway Module
  {
    id: 'gateway-1',
    name: 'Gateway AI Settings Provider',
    description: 'Encryption/decryption of AI settings API keys',
    status: 'completed',
    category: 'Gateway',
  },
  {
    id: 'gateway-2',
    name: 'Gateway Service',
    description: 'Service layer for gateway operations with agent HTTP integration',
    status: 'completed',
    category: 'Gateway',
  },
  {
    id: 'gateway-3',
    name: 'Gateway Controller',
    description: 'HTTP request handlers for gateway endpoints',
    status: 'completed',
    category: 'Gateway',
  },
  {
    id: 'gateway-4',
    name: 'Gateway Router',
    description: 'Express routes for gateway API endpoints',
    status: 'completed',
    category: 'Gateway',
  },
  {
    id: 'gateway-5',
    name: 'Gateway Agent Endpoints',
    description: 'Agent HTTP endpoints: /gateway/status, /gateway/rules, /gateway/stats',
    status: 'pending',
    category: 'Gateway',
  },
  {
    id: 'gateway-6',
    name: 'Gateway Frontend API Client',
    description: 'Frontend API client for gateway endpoints',
    status: 'completed',
    category: 'Gateway',
  },
  // Core Modules
  {
    id: 'core-1',
    name: 'Server Settings Module',
    description: 'AWS credentials and server configuration management',
    status: 'completed',
    category: 'Core',
  },
  {
    id: 'core-2',
    name: 'Firewall Module',
    description: 'Firewall rules management and AWS synchronization',
    status: 'completed',
    category: 'Core',
  },
  {
    id: 'core-3',
    name: 'Domains Module',
    description: 'Domain management and DNS configuration',
    status: 'completed',
    category: 'Core',
  },
  {
    id: 'core-4',
    name: 'Monitoring Module',
    description: 'System metrics and monitoring dashboard',
    status: 'completed',
    category: 'Core',
  },
  {
    id: 'core-5',
    name: 'SSL Module',
    description: 'SSL certificate management via Certbot',
    status: 'completed',
    category: 'Core',
  },
  {
    id: 'core-6',
    name: 'Security Analytics Module',
    description: 'Security analytics and threat detection',
    status: 'completed',
    category: 'Core',
  },
];

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/30',
    label: 'Completed',
  },
  'in-progress': {
    icon: Clock,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
    label: 'In Progress',
  },
  pending: {
    icon: AlertCircle,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    borderColor: 'border-yellow-400/30',
    label: 'Pending',
  },
  blocked: {
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/30',
    label: 'Blocked',
  },
};

export default function SystemStatusPage() {
  const groupedRequirements = requirements.reduce((acc, req) => {
    if (!acc[req.category]) {
      acc[req.category] = [];
    }
    acc[req.category].push(req);
    return acc;
  }, {} as Record<string, Requirement[]>);

  const statusCounts = requirements.reduce((acc, req) => {
    acc[req.status] = (acc[req.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-slate-400 mt-1">Track requirements and their implementation status</p>
        </div>
      </header>

      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(statusConfig).map(([status, config]) => {
          const count = statusCounts[status] || 0;
          const Icon = config.icon;
          return (
            <div
              key={status}
              className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-4`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">{config.label}</p>
                  <p className="text-2xl font-bold text-white">{count}</p>
                </div>
                <Icon className={`h-8 w-8 ${config.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Requirements by Category */}
      <div className="space-y-6">
        {Object.entries(groupedRequirements).map(([category, reqs]) => (
          <div key={category} className="bg-slate-900/60 rounded-xl border border-slate-800 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">{category}</h2>
            <div className="space-y-3">
              {reqs.map((req) => {
                const config = statusConfig[req.status];
                const Icon = config.icon;
                return (
                  <div
                    key={req.id}
                    className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`h-5 w-5 ${config.color}`} />
                          <h3 className="font-semibold text-white">{req.name}</h3>
                        </div>
                        <p className="text-sm text-slate-400">{req.description}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                        {config.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


