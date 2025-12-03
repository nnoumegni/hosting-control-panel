"use client";

import { useState } from 'react';
import { Server, Loader2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { InstallWebServerModal } from './install-web-server-modal';
import { UninstallWebServerModal } from './uninstall-web-server-modal';

interface WebServerInstallPanelProps {
  webServerType: 'nginx' | 'apache' | 'none';
  webServerVersion?: string;
  isWebServerRunning?: boolean;
  onInstall: (config: {
    type: 'nginx' | 'apache';
    httpPort: number;
    httpsPort: number;
    phpVersion?: string;
    extras?: string;
    configureFirewall: boolean;
  }) => void;
  onUninstall: () => void;
  isInstalling?: boolean;
  isUninstalling?: boolean;
  installationProgress?: string;
  uninstallationProgress?: string;
}

export function WebServerInstallPanel({
  webServerType,
  webServerVersion,
  isWebServerRunning,
  onInstall,
  onUninstall,
  isInstalling = false,
  isUninstalling = false,
  installationProgress,
  uninstallationProgress,
}: WebServerInstallPanelProps) {
  const [openInstallModal, setOpenInstallModal] = useState(false);
  const [openUninstallModal, setOpenUninstallModal] = useState(false);
  const [serverType, setServerType] = useState<'nginx' | 'apache' | null>(null);

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-amber-200 uppercase">
              {webServerType === 'none' ? 'Web Server: Not Detected' : 'Web Server'}
            </h3>
          </div>
        </div>

        {webServerType === 'none' ? (
          <>
            <p className="text-xs text-amber-300/70">
              No web server found. Install one below:
            </p>

            {isInstalling ? (
              <div className="flex items-start gap-2 text-xs text-amber-300/90">
                <Loader2 className="h-4 w-4 animate-spin mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Installing...</p>
                  {installationProgress && (
                    <p className="text-xs text-amber-400/70 mt-1 truncate" title={installationProgress}>
                      {installationProgress}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setServerType('apache');
                    setOpenInstallModal(true);
                  }}
                  className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-xs font-medium transition"
                >
                  Install Apache
                </button>
                <button
                  onClick={() => {
                    setServerType('nginx');
                    setOpenInstallModal(true);
                  }}
                  className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium transition"
                >
                  Install Nginx
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Status:</span>
                <div className="flex items-center gap-1.5">
                  {isWebServerRunning ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Running</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-rose-400" />
                      <span className="text-rose-400 font-medium">Stopped</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpenUninstallModal(true)}
                disabled={isUninstalling}
                className="text-rose-400 hover:text-rose-300 transition disabled:opacity-50 disabled:cursor-not-allowed p-1"
                title="Uninstall web server"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-slate-400">
              <span className="capitalize font-medium text-slate-300">{webServerType}</span>
              {webServerVersion && ` ${webServerVersion}`}
            </div>

            {isUninstalling && (
              <div className="flex items-start gap-2 text-xs text-rose-300/90">
                <Loader2 className="h-4 w-4 animate-spin mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Uninstalling...</p>
                  {uninstallationProgress && (
                    <p className="text-xs text-rose-400/70 mt-1 truncate" title={uninstallationProgress}>
                      {uninstallationProgress}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {openInstallModal && serverType && (
        <InstallWebServerModal
          type={serverType}
          onClose={() => {
            setOpenInstallModal(false);
            setServerType(null);
          }}
          onInstall={(config) => {
            onInstall(config);
            setOpenInstallModal(false);
            setServerType(null);
          }}
          isInstalling={isInstalling}
        />
      )}

      {openUninstallModal && webServerType !== 'none' && (
        <UninstallWebServerModal
          type={webServerType}
          onClose={() => setOpenUninstallModal(false)}
          onConfirm={() => {
            onUninstall();
            setOpenUninstallModal(false);
          }}
          isUninstalling={isUninstalling}
        />
      )}
    </>
  );
}

