// agent/src/core/config.ts

export interface AgentConfig {
  version: string;
  dashboardUrl: string; // API URL
  instanceId: string;
  logPaths: string[];
  tailFormat: "apache-clf" | "nginx" | "nginx-json";
  autoUpdate: boolean;
  autoUpdateUrl: string;
  heartbeatInterval: number; // seconds
}

export const DEFAULT_CONFIG: AgentConfig = {
  version: "1.0.0",
  dashboardUrl: "https://api.jetcamer.com",
  instanceId: "",
  logPaths: [
    "/var/log/apache2/access.log",
    "/var/log/httpd/access_log",
    "/var/log/nginx/access.log",
  ],
  tailFormat: "apache-clf",
  autoUpdate: true,
  autoUpdateUrl: "https://api.jetcamer.com/download/security/agent",
  heartbeatInterval: 10,
};

export function loadConfig(): AgentConfig {
  // later we can read /etc/jetcamer-agent/config.json if needed
  return { ...DEFAULT_CONFIG };
}
