import {
  SendCommandCommand,
  SSMClient,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';
import { logger } from '../../core/logger/index.js';
import { BadRequestError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import type { AgentConfig } from './monitoring.repository.js';

export interface AgentDeploymentStatus {
  status: 'installing' | 'installed' | 'failed' | 'not_installed';
  commandId?: string;
  message?: string;
}

export class AgentDeploymentService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async buildSSMClient(): Promise<SSMClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings) {
      throw new BadRequestError('Server settings not configured.');
    }

    if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
      throw new BadRequestError('AWS credentials not configured.');
    }

    return new SSMClient({
      region: serverSettings.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Generate agent installation script
   */
  private generateInstallScript(config: AgentConfig): string {
    const apiUrl = config.dashboardUrl;
    const instanceId = config.instanceId;
    const heartbeatInterval = config.heartbeatInterval || 10;

    // Generate agent installation script
    // This installs the monitoring agent via npm/git or downloads a pre-built binary
    // For now, we'll create a script that sets up the agent using Node.js
    
    return `#!/bin/bash
set -e  # Exit on error, but we'll handle failures explicitly

echo "📦 Installing Monitoring Agent..."
echo "Instance ID: ${instanceId}"
echo "API URL: ${apiUrl}"

# Track errors explicitly
ERRORS=0

# Create agent directory
AGENT_DIR="/opt/jetcamer-monitoring-agent"
mkdir -p $AGENT_DIR
cd $AGENT_DIR

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "Installing Node.js..."
  # Amazon Linux 2023 / Amazon Linux 2
  if [ -f /etc/system-release ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>&1
    yum install -y nodejs 2>&1
  # Ubuntu/Debian
  elif [ -f /etc/debian_version ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1
    apt-get install -y nodejs 2>&1
  fi
  
  # Verify installation
  if ! command -v node &> /dev/null; then
    echo "ERROR: Failed to install Node.js"
    exit 1
  fi
  echo "Node.js installed: $(node --version)"
fi

# Install chokidar for better file watching (handles rotation, new files, etc.)
echo "Installing chokidar for efficient log file watching..."
npm install -g chokidar 2>&1 || {
  echo "Attempting to install chokidar locally..."
  mkdir -p $AGENT_DIR/node_modules
  cd $AGENT_DIR
  npm init -y >/dev/null 2>&1
  npm install chokidar 2>&1 || echo "Warning: chokidar installation failed, falling back to fs.watch"
}

# Create agent configuration with proper JSON formatting
# Ensure logPaths is always an array
LOG_PATHS=$(echo '${JSON.stringify(config.logPaths || [])}' | sed 's/"/\\"/g')
cat > $AGENT_DIR/config.json <<EOF
{
  "version": "1.0.0",
  "dashboardUrl": "${apiUrl}",
  "instanceId": "${instanceId}",
  "logPaths": ${JSON.stringify(config.logPaths || [])},
  "tailFormat": ${config.tailFormat ? `"${config.tailFormat}"` : 'null'},
  "autoUpdate": ${config.autoUpdate !== false},
  "heartbeatInterval": ${heartbeatInterval},
  "requestThreshold": ${config.requestThreshold || 200},
  "blockDurationMinutes": ${config.blockDurationMinutes || 60}
}
EOF

# Validate JSON syntax
if ! node -e "require('./config.json')" 2>&1; then
  echo "❌ ERROR: Generated config.json is invalid JSON"
  cat $AGENT_DIR/config.json
  exit 1
fi
echo "✅ Config file created and validated"

# Create systemd service file
cat > /etc/systemd/system/jetcamer-monitoring-agent.service <<EOF
[Unit]
Description=JetCamer Monitoring Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_DIR
ExecStart=/usr/bin/node $AGENT_DIR/agent.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF

# Create robust agent script that exposes a local API endpoint for pull-based monitoring
cat > $AGENT_DIR/agent.js <<'AGENTEOF'
/**
 * JETCAMER UNIVERSAL MONITORING AGENT
 * -----------------------------------
 * ZERO-CONFIG, SELF-DETECTING, LOG-PARSING, ROTATION-SAFE
 */

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const readline = require('readline');

// Load config
let config = { version: "1.1.0" };
try {
  config = Object.assign(config, require("./config.json"));
} catch (err) {
  console.error("❌ Failed to load config.json:", err.message);
}

// --- CONSTANTS ---
const MAX_BUFFER = 2000;
const PORT = 9876;
const POLL_INTERVAL = 2000;

const events = [];
const fileState = new Map(); // { path: { inode, size, pos } }
const watchers = new Map();

// Try load chokidar
let chokidar = null;
try {
  chokidar = require("chokidar");
  console.log("🟢 Using chokidar for watching");
} catch {
  console.log("🟡 Chokidar not installed, fallback to fs.watch");
}

/* ---------------------------------------------------------
   SYSTEM DETECTION
--------------------------------------------------------- */

function detectWebServer() {
  const checks = [
    { name: "Nginx", test: "/usr/sbin/nginx", logs: "/var/log/nginx" },
    { name: "Apache2", test: "/usr/sbin/apache2", logs: "/var/log/apache2" },
    { name: "Apache", test: "/usr/sbin/httpd", logs: "/var/log/httpd" },
    { name: "LiteSpeed", test: "/usr/local/lsws", logs: "/usr/local/lsws/logs" }
  ];

  for (const c of checks) {
    if (fs.existsSync(c.test) || fs.existsSync(c.logs)) return c;
  }

  return { name: "Unknown", logs: "/var/log" };
}

const srv = detectWebServer();
console.log(\`🛰 Detected web server: \${srv.name}\`);
console.log(\`📁 Default log root: \${srv.logs}\`);

/* ---------------------------------------------------------
   LOG AUTODISCOVERY
--------------------------------------------------------- */

function discoverLogs() {
  const results = [];
  const candidates = [];

  // User-configured paths first
  if (Array.isArray(config.logPaths)) {
    for (const p of config.logPaths) candidates.push(p);
  }

  // Auto-detect known folders
  candidates.push(srv.logs);
  candidates.push("/var/log");
  candidates.push("/var/log/nginx");
  candidates.push("/var/log/httpd");
  candidates.push("/var/log/apache2");

  const visited = new Set();

  for (const base of candidates) {
    if (!base || visited.has(base) || !fs.existsSync(base)) continue;
    visited.add(base);

    try {
      const files = fs.readdirSync(base);
      for (const file of files) {
        const fp = path.join(base, file);
        if (/access|error|log/i.test(file) && fs.statSync(fp).isFile()) {
          results.push(fp);
        }
      }
    } catch {}
  }

  return Array.from(new Set(results));
}

let logFiles = discoverLogs();
// Filter out rotated log files (those with date patterns like -20251019 or .gz files)
logFiles = logFiles.filter(f => !f.match(/-[0-9]{8}/) && !f.endsWith('.gz'));
console.log(\`📌 Discovered \${logFiles.length} active log file(s) (excluding rotated/compressed)\`);
logFiles.slice(0, 10).forEach(f => console.log("   →", f));
if (logFiles.length > 10) console.log(\`   ... and \${logFiles.length - 10} more\`);

/* ---------------------------------------------------------
   LOG PARSING ENGINE
--------------------------------------------------------- */

function parseLog(line) {
  line = line.trim();
  if (!line) return null;

  // JSON logs
  if (line.startsWith("{")) {
    try {
      const j = JSON.parse(line);
      return {
        ip: j.remote_addr || j.client || "",
        method: j.request?.split(" ")[0] || "",
        path: j.request?.split(" ")[1] || "",
        status: Number(j.status || 0),
        ua: j.http_user_agent || "",
        raw: line
      };
    } catch {}
  }

  // Apache / Nginx common log format
  const clf = line.match(/^(\\S+) \\S+ \\S+ \\[[^\\]]+\\] "(\\S+)\\s+(\\S+)[^"]*" (\\d+)/);
  if (clf) {
    return {
      ip: clf[1],
      method: clf[2],
      path: clf[3],
      status: Number(clf[4]) || 0,
      raw: line
    };
  }

  return null;
}

/* ---------------------------------------------------------
   FILE TAILING (ROTATION-SAFE)
--------------------------------------------------------- */

function tail(file) {
  if (!fs.existsSync(file)) return;

  fs.stat(file, (err, st) => {
    if (err) return;

    const prev = fileState.get(file);
    if (!prev) {
      // First start: skip old logs (start from end of file)
      fileState.set(file, { inode: st.ino, size: st.size, pos: st.size });
      // Schedule a read after a short delay to check for new entries
      setTimeout(() => tail(file), 1000);
      return;
    }

    // Rotation: inode changed
    if (prev.inode !== st.ino) {
      console.log("🔄 Rotation detected:", file);
      fileState.set(file, { inode: st.ino, size: st.size, pos: 0 });
    }

    const state = fileState.get(file);
    if (state.pos > st.size) {
      // Truncated
      console.log("🧹 Truncated:", file);
      state.pos = 0;
    }

    if (state.pos === st.size) return; // nothing new

    const stream = fs.createReadStream(file, { start: state.pos, encoding: "utf8" });
    const rl = readline.createInterface({ input: stream });

    rl.on("line", ln => {
      const parsed = parseLog(ln);
      if (parsed) {
        parsed.ts = new Date().toISOString();
        parsed.timestamp = parsed.ts; // For compatibility
        parsed.userAgent = parsed.ua || null; // For compatibility
        events.push(parsed);
        if (events.length > MAX_BUFFER) events.shift();
      }
      state.pos += Buffer.byteLength(ln) + 1;
    });

    rl.on("close", () => {
      fileState.set(file, state);
      // Check if file grew during read - if so, tail again immediately
      fs.stat(file, (err, st) => {
        if (!err && st.size > state.pos) {
          // File grew during read, tail again to catch new entries
          setTimeout(() => tail(file), 100);
        }
      });
    });
    
    rl.on("error", (err) => {
      console.error("Error reading file", file, ":", err.message);
    });
    
    stream.on("error", (err) => {
      console.error("Error reading stream", file, ":", err.message);
    });
  });
}

function watch(file) {
  console.log("👁 Watching", file);

  if (chokidar) {
    const w = chokidar.watch(file, { ignoreInitial: true });
    w.on("change", () => tail(file));
    watchers.set(file, w);
  } else {
    const w = fs.watch(file, () => tail(file));
    watchers.set(file, w);
  }
}

// Determine which log files to watch
// Use config.logPaths if available (from database), otherwise use discovered logFiles
const filesToWatch = (Array.isArray(config.logPaths) && config.logPaths.length > 0)
  ? config.logPaths.filter(f => !f.match(/-[0-9]{8}/) && !f.endsWith('.gz'))
  : logFiles;

// Start watchers
filesToWatch.forEach(f => {
  fileState.set(f, { inode: 0, size: 0, pos: 0 });
  watch(f);
  tail(f);
});

/* ---------------------------------------------------------
   METRICS
--------------------------------------------------------- */

function getStatus() {
  // Determine which log files to report
  // Use config.logPaths if available (from database), otherwise use discovered logFiles
  let activeLogFiles = [];
  if (Array.isArray(config.logPaths) && config.logPaths.length > 0) {
    // Use configured log paths (from database)
    activeLogFiles = config.logPaths.filter(f => !f.match(/-[0-9]{8}/) && !f.endsWith('.gz'));
  } else {
    // Fall back to discovered log files
    activeLogFiles = logFiles.slice(0, 20);
  }
  
  // Also check what files are actually being watched (from fileState)
  const watchedFiles = Array.from(fileState.keys());
  if (activeLogFiles.length === 0 && watchedFiles.length > 0) {
    // If no active files from config/discovery but files are being watched, use those
    activeLogFiles = watchedFiles.filter(f => !f.match(/-[0-9]{8}/) && !f.endsWith('.gz')).slice(0, 20);
  }
  
  return {
    version: config.version || "1.1.0",
    status: 'online',
    webServer: srv.name,
    uptime: process.uptime(),
    logs: activeLogFiles,
    logsCount: activeLogFiles.length, // Include total count
    metrics: {
      cpuLoad: Math.round(os.loadavg()[0] * 100) / 100,
      memoryUsedPct: Math.round(((os.totalmem() - os.freemem()) / os.totalmem() * 100) * 10) / 10,
      uptime: os.uptime()
    },
    blockedIps: []
  };
}

/* ---------------------------------------------------------
   HTTP SERVER
--------------------------------------------------------- */

const server = http.createServer((req, res) => {
  // Only allow localhost connections
  if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  res.setHeader("Content-Type", "application/json");

  if (req.url.startsWith("/logs")) {
    // Get query parameters
    const urlParts = req.url.split('?');
    const queryString = urlParts[1] || '';
    const params = {};
    queryString.split('&').forEach(param => {
      const [key, value] = param.split('=');
      if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
    });
    
    const limit = parseInt(params.limit || '50');
    const since = params.since;
    
    let filteredEvents = [...events].reverse();
    
    // Filter by timestamp if provided
    if (since) {
      const sinceDate = new Date(since);
      filteredEvents = filteredEvents.filter(e => new Date(e.timestamp || e.ts) >= sinceDate);
    }
    
    // Limit results
    filteredEvents = filteredEvents.slice(0, limit);
    
    return res.end(JSON.stringify({ total: events.length, events: filteredEvents }));
  }

  if (req.url === "/status") {
    try {
      const status = getStatus();
      // Ensure compatibility with expected format
      const response = {
        version: status.version || "1.1.0",
        status: status.status || "online",
        metrics: status.metrics || {},
        blockedIps: status.blockedIps || [],
        uptime: status.uptime || process.uptime(),
        webServer: status.webServer,
        logs: status.logs || [],
        logsCount: status.logsCount || (status.logs ? status.logs.length : 0)
      };
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } catch (err) {
      console.error("Error in /status endpoint:", err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
  if (req.url === "/health") return res.end(JSON.stringify({ status: "ok" }));
  if (req.url === "/metrics") {
    const stats = getStatus().metrics;
    return res.end(JSON.stringify(stats));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.on("error", (err) => {
  console.error("❌ Server error:", err.message);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(\`🚀 Agent running at http://127.0.0.1:\${PORT}\`);
});

// Polling for all files (continues tailing after initial read)
setInterval(() => {
  // Use config.logPaths if available (from database), otherwise use discovered logFiles
  const filesToPoll = (Array.isArray(config.logPaths) && config.logPaths.length > 0)
    ? config.logPaths.filter(f => !f.match(/-[0-9]{8}/) && !f.endsWith('.gz'))
    : logFiles;
  filesToPoll.forEach(f => {
    try {
      if (fs.existsSync(f)) tail(f);
    } catch (e) {
      console.error("Error in polling interval for", f, ":", e.message);
    }
  });
}, POLL_INTERVAL);

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection:", reason);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  server.close(() => process.exit(0));
});
AGENTEOF

chmod +x $AGENT_DIR/agent.js

# Validate agent.js syntax BEFORE starting the service
echo ""
echo "🔍 Validating agent.js syntax..."
if ! node -c $AGENT_DIR/agent.js 2>&1; then
  echo "❌ CRITICAL: agent.js has syntax errors!"
  echo "Syntax check output:"
  node -c $AGENT_DIR/agent.js 2>&1 || true
  ERRORS=$((ERRORS + 1))
fi

# Validate config.json syntax
echo "🔍 Validating config.json..."
if ! node -e "JSON.parse(require('fs').readFileSync('$AGENT_DIR/config.json', 'utf-8'))" 2>&1; then
  echo "❌ CRITICAL: config.json is invalid!"
  echo "Config file contents:"
  cat $AGENT_DIR/config.json
  ERRORS=$((ERRORS + 1))
fi

# Test if agent.js can be required (this will catch runtime errors in module loading)
echo "🔍 Testing agent.js module loading..."
if ! timeout 5 node -e "try { require('$AGENT_DIR/agent.js'); } catch(e) { console.error('Module load error:', e.message); process.exit(1); }" 2>&1; then
  echo "⚠️ WARNING: agent.js has module loading issues (this might be expected if server binds immediately)"
fi

if [ $ERRORS -gt 0 ]; then
  echo "❌ Validation failed with $ERRORS errors. Cannot start service."
  exit 1
fi

echo "✅ All validations passed"

# Stop existing service if running
if systemctl is-active --quiet jetcamer-monitoring-agent 2>/dev/null; then
  echo "Stopping existing service..."
  systemctl stop jetcamer-monitoring-agent 2>&1 || true
  sleep 2
fi

# Reload systemd and enable service
echo "🔧 Setting up systemd service..."
systemctl daemon-reload 2>&1 || true
systemctl enable jetcamer-monitoring-agent 2>&1 || true

# Start the service
echo "🚀 Starting monitoring agent service..."
START_OUTPUT=$(systemctl start jetcamer-monitoring-agent 2>&1)
START_EXIT=$?

if [ $START_EXIT -ne 0 ]; then
  echo "⚠️ systemctl start returned exit code: $START_EXIT"
  echo "$START_OUTPUT"
fi

# Wait a moment for service to initialize
sleep 3

# Check service status with retries and detailed diagnostics
MAX_RETRIES=10
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if systemctl is-active --quiet jetcamer-monitoring-agent 2>/dev/null; then
    echo ""
    echo "✅ Monitoring Agent installed and started successfully!"
    echo ""
    echo "=== Service Status ==="
    systemctl status jetcamer-monitoring-agent --no-pager | head -20
    echo ""
    echo "=== Testing Agent API ==="
    sleep 2
    if curl -s --max-time 3 http://127.0.0.1:9876/health >/dev/null 2>&1; then
      echo "✅ Agent API is responding"
      curl -s --max-time 3 http://127.0.0.1:9876/status | head -5 || echo "Status endpoint check failed"
    else
      echo "⚠️ Agent API not responding yet (may need a moment to initialize)"
    fi
    exit 0
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting for service to start... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  
  # Show service status on every 3rd attempt
  if [ $((RETRY_COUNT % 3)) -eq 0 ]; then
    echo "Current service status:"
    systemctl status jetcamer-monitoring-agent --no-pager | head -15 || true
  fi
  
  sleep 2
done

# If we get here, service failed to start - provide comprehensive diagnostics
echo ""
echo "❌ Service failed to start after $MAX_RETRIES attempts"
echo ""
echo "=== COMPREHENSIVE DIAGNOSTICS ==="
echo ""
echo "=== Service Status ==="
systemctl status jetcamer-monitoring-agent --no-pager || true
echo ""
echo "=== Recent Service Logs (last 50 lines) ==="
journalctl -u jetcamer-monitoring-agent -n 50 --no-pager || echo "Could not retrieve logs"
echo ""
echo "=== Agent Files ==="
ls -la $AGENT_DIR/ 2>&1 || echo "Agent directory not found"
echo ""
echo "=== Config.json Contents ==="
cat $AGENT_DIR/config.json 2>&1 || echo "Could not read config.json"
echo ""
echo "=== Testing Node.js ==="
command -v node >/dev/null && node --version || echo "❌ Node.js not found in PATH"
echo ""
echo "=== Testing agent.js syntax ==="
node -c $AGENT_DIR/agent.js 2>&1 || echo "❌ Syntax check failed"
echo ""
echo "=== Testing agent.js module load ==="
timeout 10 node -e "console.log('Loading agent...'); require('$AGENT_DIR/agent.js');" 2>&1 | head -20 || echo "Module load test failed or timed out"
echo ""
echo "=== Port 9876 status ==="
netstat -tlnp 2>/dev/null | grep 9876 || ss -tlnp 2>/dev/null | grep 9876 || echo "Port 9876 not in use"
echo ""

exit 1
`;
  }

  /**
   * Deploy monitoring agent to EC2 instance
   */
  async deployAgent(instanceId: string, config: AgentConfig): Promise<{ commandId: string }> {
    const client = await this.buildSSMClient();
    const installScript = this.generateInstallScript(config);

    logger.info({ instanceId }, 'Deploying monitoring agent');

    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [installScript],
      },
      TimeoutSeconds: 300,
    });

    const response = await client.send(command);

    if (!response.Command?.CommandId) {
      throw new Error('Failed to send deployment command');
    }

    logger.info({ instanceId, commandId: response.Command.CommandId }, 'Agent deployment command sent');

    return { commandId: response.Command.CommandId };
  }

  /**
   * Check deployment status
   */
  async checkDeploymentStatus(instanceId: string, commandId: string): Promise<AgentDeploymentStatus> {
    const client = await this.buildSSMClient();

    try {
      const response = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }),
      );

      const status = response.Status || 'Unknown';
      const output = response.StandardOutputContent || '';
      const error = response.StandardErrorContent || '';

      if (status === 'Success') {
        // Check if the output indicates success or failure
        const outputLower = (output || '').toLowerCase();
        // More specific checks - only fail if it's actually a failure, not just warnings
        if (outputLower.includes('failed to start') || 
            outputLower.includes('service failed to start') ||
            outputLower.includes('exit 1') ||
            outputLower.includes('status=1/failure') ||
            outputLower.includes('syntax errors')) {
          return {
            status: 'failed',
            commandId,
            message: output || error || 'Agent installation succeeded but service failed to start',
          };
        }
        
        // Success - check for success indicators
        if (outputLower.includes('started successfully') || 
            outputLower.includes('already running') ||
            outputLower.includes('monitoring agent started')) {
          return {
            status: 'installed',
            commandId,
            message: 'Agent installed successfully',
          };
        }
        
        // If we get here and status is Success, assume it worked
        return {
          status: 'installed',
          commandId,
          message: 'Agent installed successfully',
        };
      } else if (status === 'InProgress' || status === 'Pending') {
        return {
          status: 'installing',
          commandId,
          message: 'Installation in progress...',
        };
      } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
        // Include more diagnostic information in the error message
        const errorMessage = error || output || `Command ${status.toLowerCase()}`;
        const fullOutput = output ? `Output: ${output.substring(0, 500)}` : '';
        const fullError = error ? `Error: ${error.substring(0, 500)}` : '';
        
        logger.warn({ 
          instanceId, 
          commandId, 
          status,
          outputPreview: output?.substring(0, 200),
          errorPreview: error?.substring(0, 200)
        }, 'SSM command failed');
        
        return {
          status: 'failed',
          commandId,
          message: errorMessage + (fullOutput ? `\n${fullOutput}` : '') + (fullError ? `\n${fullError}` : ''),
        };
      }

      return {
        status: 'not_installed',
        commandId,
        message: `Unknown status: ${status}. Output: ${output?.substring(0, 500) || 'none'}`,
      };
    } catch (error: any) {
      logger.error({ err: error, instanceId, commandId }, 'Failed to check deployment status');
      return {
        status: 'failed',
        commandId,
        message: error.message || 'Failed to check deployment status',
      };
    }
  }

  /**
   * Start monitoring agent (only starts the service, doesn't install)
   */
  async startAgent(instanceId: string): Promise<{ commandId: string }> {
    const client = await this.buildSSMClient();

    const startScript = `#!/bin/bash
set +e  # Don't exit on errors, handle them manually

echo "Starting Monitoring Agent..."

# Reload systemd daemon
systemctl daemon-reload 2>&1 || true

# Check if service is already running
if systemctl is-active --quiet jetcamer-monitoring-agent; then
  echo "✅ Monitoring Agent is already running"
  systemctl status jetcamer-monitoring-agent --no-pager | head -10
  exit 0
fi

# Try to start the service
START_OUTPUT=$(systemctl start jetcamer-monitoring-agent 2>&1)
START_EXIT=$?

if [ $START_EXIT -ne 0 ]; then
  echo "⚠️ systemctl start returned exit code: $START_EXIT"
  echo "$START_OUTPUT"
fi

# Wait a moment for service to start
sleep 3

# Check if service is active now
if systemctl is-active --quiet jetcamer-monitoring-agent; then
  echo "✅ Monitoring Agent started successfully"
  systemctl status jetcamer-monitoring-agent --no-pager | head -10
  exit 0
else
  echo "⚠️ Monitoring Agent service is not active"
  echo ""
  echo "=== Service Status ==="
  systemctl status jetcamer-monitoring-agent --no-pager | head -30
  echo ""
  echo "=== Recent Service Logs ==="
  journalctl -u jetcamer-monitoring-agent -n 50 --no-pager 2>&1 || echo "Could not retrieve logs"
  echo ""
  echo "=== Checking Agent Files ==="
  if [ -f /etc/systemd/system/jetcamer-monitoring-agent.service ]; then
    echo "✅ Service file exists"
  else
    echo "❌ Service file not found"
    exit 1
  fi
  if [ -f /opt/jetcamer-monitoring-agent/agent.js ]; then
    echo "✅ agent.js exists"
    ls -la /opt/jetcamer-monitoring-agent/agent.js
  else
    echo "❌ agent.js not found"
    exit 1
  fi
  if [ -f /opt/jetcamer-monitoring-agent/config.json ]; then
    echo "✅ config.json exists"
    echo "Config contents (first 3 lines):"
    head -3 /opt/jetcamer-monitoring-agent/config.json || echo "Could not read config"
  else
    echo "❌ config.json not found"
    exit 1
  fi
  echo ""
  echo "=== Checking Node.js ==="
  if command -v node >/dev/null 2>&1; then
    echo "✅ Node.js found: $(node --version)"
  else
    echo "❌ Node.js not found"
    exit 1
  fi
  echo ""
  echo "=== Testing agent.js syntax ==="
  if node -c /opt/jetcamer-monitoring-agent/agent.js 2>&1; then
    echo "✅ agent.js syntax is valid"
  else
    echo "❌ agent.js has syntax errors"
    exit 1
  fi
  echo ""
  echo "⚠️ Service exists but failed to start. Check logs above for details."
  echo "This indicates the agent script is crashing. It will be automatically redeployed."
  exit 1
fi
`;

    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [startScript],
      },
      TimeoutSeconds: 30,
    });

    const response = await client.send(command);

    if (!response.Command?.CommandId) {
      throw new Error('Failed to send start command');
    }

    logger.info({ instanceId, commandId: response.Command.CommandId }, 'Agent start command sent');

    return { commandId: response.Command.CommandId };
  }

  /**
   * Stop monitoring agent (only stops the service, doesn't uninstall)
   */
  async stopAgent(instanceId: string): Promise<{ commandId: string }> {
    const client = await this.buildSSMClient();

    const stopScript = `#!/bin/bash
set -e

echo "Stopping Monitoring Agent..."

systemctl stop jetcamer-monitoring-agent || true

if ! systemctl is-active --quiet jetcamer-monitoring-agent; then
  echo "✅ Monitoring Agent stopped"
  exit 0
else
  echo "⚠️ Failed to stop Monitoring Agent"
  systemctl status jetcamer-monitoring-agent --no-pager | head -10
  exit 1
fi
`;

    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [stopScript],
      },
      TimeoutSeconds: 30,
    });

    const response = await client.send(command);

    if (!response.Command?.CommandId) {
      throw new Error('Failed to send stop command');
    }

    logger.info({ instanceId, commandId: response.Command.CommandId }, 'Agent stop command sent');

    return { commandId: response.Command.CommandId };
  }

  /**
   * Uninstall agent (removes everything including config files)
   */
  async uninstallAgent(instanceId: string): Promise<{ commandId: string }> {
    const client = await this.buildSSMClient();

    const uninstallScript = `#!/bin/bash
set -e

echo "Removing Monitoring Agent..."

systemctl stop jetcamer-monitoring-agent || true
systemctl disable jetcamer-monitoring-agent || true
rm -f /etc/systemd/system/jetcamer-monitoring-agent.service
systemctl daemon-reload

rm -rf /opt/jetcamer-monitoring-agent

echo "✅ Monitoring Agent removed"
`;

    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [uninstallScript],
      },
      TimeoutSeconds: 60,
    });

    const response = await client.send(command);

    if (!response.Command?.CommandId) {
      throw new Error('Failed to send uninstall command');
    }

    logger.info({ instanceId, commandId: response.Command.CommandId }, 'Agent uninstall command sent');

    return { commandId: response.Command.CommandId };
  }

  /**
   * Test reading a log file directly via SSM to verify access
   */
  async testLogFileAccess(instanceId: string, logPath: string): Promise<{ exists: boolean; readable: boolean; lines: string[] }> {
    const client = await this.buildSSMClient();
    
    const testCommand = `#!/bin/bash
if [ -f "${logPath}" ]; then
  echo "FILE_EXISTS"
  if [ -r "${logPath}" ]; then
    echo "FILE_READABLE"
    echo "=== LAST 3 LINES ==="
    tail -3 "${logPath}" 2>/dev/null | head -3
  else
    echo "FILE_NOT_READABLE"
  fi
else
  echo "FILE_NOT_EXISTS"
fi
`;

    try {
      const sendResponse = await client.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: [testCommand],
          },
          TimeoutSeconds: 30,
        }),
      );

      if (!sendResponse.Command?.CommandId) {
        throw new Error('Failed to send SSM command');
      }

      // Poll for command completion
      let invocation;
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        invocation = await client.send(
          new GetCommandInvocationCommand({
            CommandId: sendResponse.Command.CommandId,
            InstanceId: instanceId,
          }),
        );

        if (invocation.Status === 'Success' || invocation.Status === 'Failed' || invocation.Status === 'Cancelled' || invocation.Status === 'TimedOut') {
          break;
        }

        attempts++;
      }

      if (!invocation || invocation.Status !== 'Success') {
        return { exists: false, readable: false, lines: [] };
      }

      const output = invocation.StandardOutputContent?.trim() || '';
      const exists = output.includes('FILE_EXISTS');
      const readable = output.includes('FILE_READABLE');
      
      const lines = output
        .split('\n')
        .filter((line) => !line.includes('FILE_') && !line.includes('===') && line.trim().length > 0)
        .slice(0, 3);

      return { exists, readable, lines };
    } catch (error) {
      logger.error({ instanceId, logPath, err: error }, 'Failed to test log file access');
      return { exists: false, readable: false, lines: [] };
    }
  }

  /**
   * Execute a command on the instance via SSM (for utility purposes like log discovery)
   */
  async executeCommand(instanceId: string, command: string): Promise<string> {
    const client = await this.buildSSMClient();

    const sendResponse = await client.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [command],
        },
        TimeoutSeconds: 60,
      }),
    );

    if (!sendResponse.Command?.CommandId) {
      throw new Error('Failed to send SSM command');
    }

    // Poll for command completion
    let invocation;
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      invocation = await client.send(
        new GetCommandInvocationCommand({
          CommandId: sendResponse.Command.CommandId,
          InstanceId: instanceId,
        }),
      );

      if (invocation.Status === 'Success' || invocation.Status === 'Failed' || invocation.Status === 'Cancelled' || invocation.Status === 'TimedOut') {
        break;
      }

      attempts++;
    }

    if (!invocation || invocation.Status !== 'Success') {
      throw new Error(`Command failed with status: ${invocation?.Status}`);
    }

    return invocation.StandardOutputContent?.trim() || '';
  }
}

