import { useEffect, useState } from "react";

interface AgentStatus {
  isInstalled: boolean;
  isRunning: boolean;
  installationInProgress?: boolean;
  installationCommandId?: string;
}

interface AgentData {
  total?: number;
  topPaths?: Array<{ key: string; count: number }>;
  topIPs?: Array<{ key: string; count: number }>;
  topStatus?: Array<{ key: string; count: number }>;
  events?: Array<{
    ts?: number;
    ip?: string;
    path?: string;
    status?: string;
    ua?: string;
    source?: string;
  }>;
  error?: string;
}

export default function Dashboard() {
  const [instanceId, setInstanceId] = useState<string>("");
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentData, setAgentData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);

  // Load instance ID from localStorage or prompt
  useEffect(() => {
    const saved = localStorage.getItem("monitoring_instanceId");
    if (saved) {
      setInstanceId(saved);
    }
  }, []);

  // Check agent status
  const checkStatus = async () => {
    if (!instanceId) {
      setError("Please enter an instance ID");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/agent/ssm/status?instanceId=${encodeURIComponent(instanceId)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const status = await res.json();
      setAgentStatus(status);
      
      // If agent is running, fetch data
      if (status.isRunning) {
        await fetchAgentData();
      }
    } catch (e: any) {
      console.error("Failed to check status:", e);
      setError(e.message || "Failed to check agent status");
    } finally {
      setLoading(false);
    }
  };

  // Fetch agent data
  const fetchAgentData = async () => {
    if (!instanceId) return;

    try {
      const res = await fetch(`/api/agent/ssm/data?instanceId=${encodeURIComponent(instanceId)}&endpoint=/live`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAgentData(data);
    } catch (e: any) {
      console.error("Failed to fetch agent data:", e);
      setAgentData({ error: e.message || "Failed to fetch agent data" });
    }
  };

  // Install agent
  const installAgent = async () => {
    if (!instanceId) {
      setError("Please enter an instance ID");
      return;
    }

    setInstalling(true);
    setError("");
    try {
      const res = await fetch("/api/agent/ssm/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      setCommandId(result.commandId);
      setAgentStatus({
        isInstalled: false,
        isRunning: false,
        installationInProgress: true,
        installationCommandId: result.commandId,
      });
      
      // Poll for installation status
      pollCommandStatus(result.commandId);
    } catch (e: any) {
      console.error("Failed to install agent:", e);
      setError(e.message || "Failed to install agent");
      setInstalling(false);
    }
  };

  // Uninstall agent
  const uninstallAgent = async () => {
    if (!instanceId) {
      setError("Please enter an instance ID");
      return;
    }

    if (!confirm("Are you sure you want to uninstall the agent?")) {
      return;
    }

    setUninstalling(true);
    setError("");
    try {
      const res = await fetch("/api/agent/ssm/uninstall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      setCommandId(result.commandId);
      
      // Poll for uninstallation status
      pollCommandStatus(result.commandId);
    } catch (e: any) {
      console.error("Failed to uninstall agent:", e);
      setError(e.message || "Failed to uninstall agent");
      setUninstalling(false);
    }
  };

  // Poll command status
  const pollCommandStatus = async (cmdId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError("Installation/uninstallation is taking longer than expected. Please check manually.");
        setInstalling(false);
        setUninstalling(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/agent/ssm/command?commandId=${encodeURIComponent(cmdId)}&instanceId=${encodeURIComponent(instanceId)}`
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const status = await res.json();

        if (status.status === "Success") {
          setInstalling(false);
          setUninstalling(false);
          setCommandId(null);
          // Refresh status
          setTimeout(() => checkStatus(), 2000);
        } else if (status.status === "Failed" || status.status === "Cancelled") {
          setError(status.error || `Command ${status.status}`);
          setInstalling(false);
          setUninstalling(false);
          setCommandId(null);
        } else {
          // Still in progress
          attempts++;
          setTimeout(poll, 5000); // Poll every 5 seconds
        }
      } catch (e: any) {
        console.error("Failed to check command status:", e);
        attempts++;
        setTimeout(poll, 5000);
      }
    };

    poll();
  };

  // Auto-refresh data if agent is running
  useEffect(() => {
    if (agentStatus?.isRunning && instanceId) {
      const interval = setInterval(() => {
        fetchAgentData();
      }, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [agentStatus?.isRunning, instanceId]);

  // Auto-check status on instance ID change
  useEffect(() => {
    if (instanceId) {
      localStorage.setItem("monitoring_instanceId", instanceId);
      checkStatus();
    }
  }, [instanceId]);

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Analytics Dashboard</h1>
        <p style={{ color: "#6b7280", marginBottom: "1rem" }}>
          Monitor and manage the cyber-agent on your EC2 instances via SSM
        </p>
      </header>

      {/* Instance ID Input */}
      <div style={{ marginBottom: "2rem", padding: "1rem", background: "#f9fafb", borderRadius: "0.5rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
          EC2 Instance ID:
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            placeholder="i-1234567890abcdef0"
            style={{
              flex: 1,
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.25rem",
              fontSize: "0.875rem",
            }}
          />
          <button
            onClick={checkStatus}
            disabled={loading || !instanceId}
            style={{
              padding: "0.5rem 1rem",
              background: loading ? "#9ca3af" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "0.25rem",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
            }}
          >
            {loading ? "Checking..." : "Check Status"}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Agent Status */}
      {agentStatus && (
        <div style={{ marginBottom: "2rem", padding: "1rem", background: "#f9fafb", borderRadius: "0.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Agent Status</h2>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <strong>Installed:</strong>{" "}
              <span style={{ color: agentStatus.isInstalled ? "#10b981" : "#ef4444" }}>
                {agentStatus.isInstalled ? "Yes" : "No"}
              </span>
            </div>
            <div>
              <strong>Running:</strong>{" "}
              <span style={{ color: agentStatus.isRunning ? "#10b981" : "#ef4444" }}>
                {agentStatus.isRunning ? "Yes" : "No"}
              </span>
            </div>
            {agentStatus.installationInProgress && (
              <div>
                <strong>Status:</strong>{" "}
                <span style={{ color: "#f59e0b" }}>Installation in progress...</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {!agentStatus.isInstalled && !agentStatus.installationInProgress && (
              <button
                onClick={installAgent}
                disabled={installing || !instanceId}
                style={{
                  padding: "0.5rem 1rem",
                  background: installing ? "#9ca3af" : "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "0.25rem",
                  cursor: installing ? "not-allowed" : "pointer",
                }}
              >
                {installing ? "Installing..." : "Install Agent"}
              </button>
            )}
            {agentStatus.isInstalled && !agentStatus.installationInProgress && (
              <button
                onClick={uninstallAgent}
                disabled={uninstalling || !instanceId}
                style={{
                  padding: "0.5rem 1rem",
                  background: uninstalling ? "#9ca3af" : "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "0.25rem",
                  cursor: uninstalling ? "not-allowed" : "pointer",
                }}
              >
                {uninstalling ? "Uninstalling..." : "Uninstall Agent"}
              </button>
            )}
            {agentStatus.isRunning && (
              <button
                onClick={fetchAgentData}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                }}
              >
                Refresh Data
              </button>
            )}
          </div>
        </div>
      )}

      {/* Agent Data */}
      {agentData && agentStatus?.isRunning && (
        <>
          {agentData.error ? (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              Error: {agentData.error}
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1rem",
                  marginBottom: "2rem",
                }}
              >
                <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "1rem", color: "#e5e7eb" }}>
                  <h3 style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>Total Events</h3>
                  <p style={{ fontSize: "1.5rem", fontWeight: 600 }}>{agentData.total || 0}</p>
                </div>
                <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "1rem", color: "#e5e7eb" }}>
                  <h3 style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>Top Paths</h3>
                  <ul style={{ fontSize: "0.8rem", listStyle: "none", padding: 0, margin: 0 }}>
                    {agentData.topPaths?.slice(0, 5).map((t) => (
                      <li key={t.key} style={{ marginBottom: "0.25rem" }}>
                        <strong>{t.key}</strong> — {t.count}
                      </li>
                    )) || <li>None</li>}
                  </ul>
                </div>
                <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "1rem", color: "#e5e7eb" }}>
                  <h3 style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>Top IPs</h3>
                  <ul style={{ fontSize: "0.8rem", listStyle: "none", padding: 0, margin: 0 }}>
                    {agentData.topIPs?.slice(0, 5).map((t) => (
                      <li key={t.key} style={{ marginBottom: "0.25rem" }}>
                        <strong>{t.key}</strong> — {t.count}
                      </li>
                    )) || <li>None</li>}
                  </ul>
                </div>
                <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "1rem", color: "#e5e7eb" }}>
                  <h3 style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>Top Status</h3>
                  <ul style={{ fontSize: "0.8rem", listStyle: "none", padding: 0, margin: 0 }}>
                    {agentData.topStatus?.slice(0, 5).map((t) => (
                      <li key={t.key} style={{ marginBottom: "0.25rem" }}>
                        <strong>{t.key}</strong> — {t.count}
                      </li>
                    )) || <li>None</li>}
                  </ul>
                </div>
              </div>

              {/* Events Table */}
              {agentData.events && agentData.events.length > 0 && (
                <div
                  style={{
                    background: "#f9fafb",
                    borderRadius: "0.75rem",
                    border: "1px solid #e5e7eb",
                    padding: "1rem",
                  }}
                >
                  <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Recent Events</h2>
                  <div style={{ maxHeight: "420px", overflow: "auto", fontSize: "0.75rem" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <th align="left" style={{ padding: "0.5rem" }}>Time</th>
                          <th align="left" style={{ padding: "0.5rem" }}>IP</th>
                          <th align="left" style={{ padding: "0.5rem" }}>Path</th>
                          <th align="left" style={{ padding: "0.5rem" }}>Status</th>
                          <th align="left" style={{ padding: "0.5rem" }}>UA</th>
                          <th align="left" style={{ padding: "0.5rem" }}>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentData.events.slice().reverse().map((e, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "0.5rem" }}>
                              {e.ts ? new Date(e.ts).toISOString() : ""}
                            </td>
                            <td style={{ padding: "0.5rem" }}>{e.ip || ""}</td>
                            <td style={{ padding: "0.5rem" }}>{e.path || ""}</td>
                            <td style={{ padding: "0.5rem" }}>{e.status || ""}</td>
                            <td style={{ padding: "0.5rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {e.ua || ""}
                            </td>
                            <td style={{ padding: "0.5rem" }}>{e.source || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {!agentStatus && !loading && instanceId && (
        <div style={{ padding: "1rem", textAlign: "center", color: "#6b7280" }}>
          Click "Check Status" to see agent status
        </div>
      )}
    </div>
  );
}
