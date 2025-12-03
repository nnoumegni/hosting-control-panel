"use client";

import { useState } from 'react';
import { Trash2, Edit2, Globe, ExternalLink, Loader2 } from 'lucide-react';

interface Domain {
  _id?: string;
  domain: string;
  instanceId: string;
  hostedZoneId: string;
  publicIp: string;
  documentRoot: string;
  webServerType: 'nginx' | 'apache';
  configPath: string;
  sslEnabled: boolean;
  sslCertificatePath?: string;
  createdAt: string;
  updatedAt: string;
}

interface DomainListProps {
  domains: Domain[];
  isLoading: boolean;
  onDelete: (idOrDomain: string) => Promise<void>;
  onEdit: (domain: Domain) => void;
  instanceId?: string;
}

export function DomainList({ domains, isLoading, onDelete, onEdit }: DomainListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (domain: Domain) => {
    if (!confirm(`Are you sure you want to delete ${domain.domain}? This will:\n- Delete the Route53 hosted zone\n- Remove DNS records\n- Delete the web server configuration\n- Remove all domain files`)) {
      return;
    }

    const id = domain._id || domain.domain;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (domains.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No domains configured yet.</p>
        <p className="text-sm mt-2">Add a domain to get started!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {domains.map((domain) => {
        const id = domain._id || domain.domain;
        const isDeleting = deletingId === id;

        return (
          <div
            key={id}
            className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <h3 className="text-lg font-semibold text-white truncate">
                    {domain.domain}
                  </h3>
                  {domain.sslEnabled && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded border border-green-500/30">
                      SSL
                    </span>
                  )}
                  <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded">
                    {domain.webServerType}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-400">
                  <div>
                    <span className="text-slate-500">Document Root:</span>{' '}
                    <span className="text-slate-300 font-mono text-xs">{domain.documentRoot}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Public IP:</span>{' '}
                    <span className="text-slate-300">{domain.publicIp}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Zone ID:</span>{' '}
                    <span className="text-slate-300 font-mono text-xs">{domain.hostedZoneId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Config:</span>{' '}
                    <span className="text-slate-300 font-mono text-xs">{domain.configPath}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                  <a
                    href={`http://${domain.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Visit Site
                  </a>
                  {domain.sslEnabled && (
                    <a
                      href={`https://${domain.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-green-400 hover:text-green-300 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Visit HTTPS
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <button
                  onClick={() => onEdit(domain)}
                  className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                  title="Edit domain"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(domain)}
                  disabled={isDeleting}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                  title="Delete domain"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

