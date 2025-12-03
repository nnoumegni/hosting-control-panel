#!/usr/bin/env bash
set -euo pipefail

echo "──────────────────────────────────────────────"
echo "   JetCamer Agent – Production Installer"
echo "──────────────────────────────────────────────"
echo

# ──────────────────────────────────────────────
# 1. Detect architecture
# ──────────────────────────────────────────────
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64)
    ARCH="amd64"
    ;;
  aarch64|arm64)
    ARCH="arm64"
    ;;
  *)
    echo "❌ Unsupported architecture: $ARCH_RAW"
    echo "   Supported: x86_64/amd64, aarch64/arm64"
    exit 1
    ;;
esac

echo "[*] Detected architecture: $ARCH_RAW → $ARCH"

# ──────────────────────────────────────────────
# 2. Configure source & version
# ──────────────────────────────────────────────
# You can override these via environment variables:
#   JETCAMER_AGENT_VERSION=1.2.3
#   JETCAMER_AGENT_BASE_URL=https://api.jetcamer.com/download/agent
#   JETCAMER_AGENT_SHA256=<exact sha256>

VERSION="${JETCAMER_AGENT_VERSION:-latest}"
BASE_URL="${JETCAMER_AGENT_BASE_URL:-https://api.jetcamer.com/download/agent}"
BINARY_NAME="jetcamer-agent-linux-${ARCH}"
DOWNLOAD_URL="${BASE_URL}/${VERSION}/${BINARY_NAME}"

echo "[*] Using agent version: ${VERSION}"
echo "[*] Download URL:        ${DOWNLOAD_URL}"
echo

# ──────────────────────────────────────────────
# 3. Expected SHA-256 (edit per release)
# ──────────────────────────────────────────────
# For production:
#   • Compute sha256 on your CI (e.g., GitHub Actions)
#   • Inject it via JETCAMER_AGENT_SHA256
#   • OR bake per-version checksums below.

EXPECTED_SHA256="${JETCAMER_AGENT_SHA256:-}"

if [[ -z "$EXPECTED_SHA256" ]]; then
  case "${VERSION}-${ARCH}" in
    # Example (you MUST replace these with real values):
    # "1.0.0-amd64")
    #   EXPECTED_SHA256="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    #   ;;
    # "1.0.0-arm64")
    #   EXPECTED_SHA256="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    #   ;;
    *)
      echo "⚠️  No embedded checksum for version=${VERSION}, arch=${ARCH}."
      echo "    You can:"
      echo "      • Set JETCAMER_AGENT_SHA256 env var before running this installer"
      echo "      • Or add a case entry in the script."
      echo "    Continuing WITHOUT checksum verification..."
      EXPECTED_SHA256=""
      ;;
  esac
fi

# ──────────────────────────────────────────────
# 4. Download binary to /tmp & verify checksum
# ──────────────────────────────────────────────
TMP_DIR="$(mktemp -d -t jetcamer-agent-XXXXXX)"
BIN_TMP="${TMP_DIR}/${BINARY_NAME}"

echo "[*] Downloading agent binary..."
curl -fsSL "$DOWNLOAD_URL" -o "$BIN_TMP"

if [[ ! -s "$BIN_TMP" ]]; then
  echo "❌ Downloaded binary is empty or missing."
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1 && [[ -n "$EXPECTED_SHA256" ]]; then
  echo "[*] Verifying SHA-256 checksum..."
  ACTUAL_SHA256="$(sha256sum "$BIN_TMP" | awk '{print $1}')"
  if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
    echo "❌ Checksum mismatch!"
    echo "   Expected: $EXPECTED_SHA256"
    echo "   Actual:   $ACTUAL_SHA256"
    exit 1
  fi
  echo "    ✓ Checksum OK"
else
  if [[ -z "$EXPECTED_SHA256" ]]; then
    echo "⚠️  Skipping checksum verification (no EXPECTED_SHA256 set)."
  else
    echo "⚠️  sha256sum not found; skipping checksum verification."
  fi
fi

# ──────────────────────────────────────────────
# 5. Install binary to /opt/jetcamer-agent
# ──────────────────────────────────────────────
INSTALL_DIR="/opt/jetcamer-agent"
BIN_PATH="${INSTALL_DIR}/jetcamer-agent"

echo "[*] Installing binary to: ${BIN_PATH}"

sudo mkdir -p "$INSTALL_DIR"
sudo cp "$BIN_TMP" "$BIN_PATH"
sudo chmod +x "$BIN_PATH"

# ──────────────────────────────────────────────
# 6. Create or update config /etc/jetcamer/agent.config.json
# ──────────────────────────────────────────────
CONFIG_DIR="/etc/jetcamer"
CONFIG_FILE="${CONFIG_DIR}/agent.config.json"

echo "[*] Ensuring config directory exists: ${CONFIG_DIR}"
sudo mkdir -p "$CONFIG_DIR"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "[*] Creating default config: ${CONFIG_FILE}"
  sudo tee "$CONFIG_FILE" >/dev/null <<'EOF'
{
  "logPaths": [],
  "webListen": "127.0.0.1:9811",

  "collectorUrl": "",
  "collectorFlushIntervalSeconds": 10,
  "collectorMaxBatchSize": 500,
  "env": "prod",
  "instanceId": "auto",
  "siteId": "default",
  "collectorApiKey": "",

  "securityEnabled": true,
  "securityMaxRpsPerIp": 50,
  "securityMaxRpmPerIp": 2000,
  "securityMaxRpmPerPath": 1000,
  "securityMaxRpmPerAsn": 5000,
  "securityBanMinutes": 60,

  "geoLiteAsnPath": "/var/lib/jetcamer/GeoLite2-ASN.mmdb",
  "geoLiteCountryPath": "/var/lib/jetcamer/GeoLite2-City.mmdb",

  "firewallIpsetName": "jetcamer_blacklist",
  "firewallNftTable": "inet",
  "firewallNftChain": "jetcamer_drop",

  "awsRegion": "",
  "awsNetworkAclId": "",
  "awsNetworkAclDenyRuleBase": 200
}
EOF
else
  echo "[*] Config already exists; updating GeoLite database paths..."
  # Always update GeoLite paths to ensure they're correct
  if command -v jq >/dev/null 2>&1; then
    # Update ASN path if ASN database exists
    if [[ -f "/var/lib/jetcamer/GeoLite2-ASN.mmdb" ]]; then
      sudo jq '.geoLiteAsnPath = "/var/lib/jetcamer/GeoLite2-ASN.mmdb"' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && \
      sudo mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    fi
    # Update Country path if City database exists
    if [[ -f "/var/lib/jetcamer/GeoLite2-City.mmdb" ]]; then
      sudo jq '.geoLiteCountryPath = "/var/lib/jetcamer/GeoLite2-City.mmdb"' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && \
      sudo mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    fi
    echo "    ✓ Config updated with GeoLite database paths"
  else
    echo "    ⚠️  jq not found; please manually update config with:"
    if [[ -f "/var/lib/jetcamer/GeoLite2-ASN.mmdb" ]]; then
      echo "      \"geoLiteAsnPath\": \"/var/lib/jetcamer/GeoLite2-ASN.mmdb\","
    fi
    if [[ -f "/var/lib/jetcamer/GeoLite2-City.mmdb" ]]; then
      echo "      \"geoLiteCountryPath\": \"/var/lib/jetcamer/GeoLite2-City.mmdb\","
    fi
  fi
fi

# ──────────────────────────────────────────────
# 7. Download and install GeoLite databases
# ──────────────────────────────────────────────
GEOIP_DIR="/var/lib/jetcamer"
echo "[*] Ensuring GeoIP directory exists: ${GEOIP_DIR}"
sudo mkdir -p "$GEOIP_DIR" || {
    echo "⚠️  Failed to create GeoIP directory, continuing anyway..."
}
sudo chmod 755 "$GEOIP_DIR" 2>/dev/null || true

# Extract server base URL (protocol + host) from BASE_URL or DOWNLOAD_URL
# BASE_URL might be like: https://api.jetcamer.com or https://api.jetcamer.com/cyber-agent/bin/...
# Extract just the protocol and host (first two parts after splitting by /)
SERVER_BASE_URL="https://api.jetcamer.com"  # Default fallback
if [[ "$BASE_URL" =~ ^(https?://[^/]+) ]]; then
    SERVER_BASE_URL="${BASH_REMATCH[1]}"
elif [[ "$DOWNLOAD_URL" =~ ^(https?://[^/]+) ]]; then
    SERVER_BASE_URL="${BASH_REMATCH[1]}"
fi

ASN_URL="${SERVER_BASE_URL}/download/geolite-asn.tar.gz"
CITY_URL="${SERVER_BASE_URL}/download/geolite-city.tar.gz"

echo "[*] Downloading GeoLite databases from ${SERVER_BASE_URL}..."

# Download ASN database
echo "[*] Downloading ASN database..."
TMP_ASN="/tmp/geolite-asn.tar.gz"
if curl -fSL --progress-bar "${ASN_URL}" -o "${TMP_ASN}"; then
    if [[ -f "$TMP_ASN" && -s "$TMP_ASN" ]]; then
        SIZE=$(du -h "$TMP_ASN" | cut -f1)
        echo "    ✓ ASN database downloaded successfully (${SIZE})"
    else
        echo "    ⚠️  Downloaded file is empty, continuing without ASN database..."
        TMP_ASN=""
    fi
else
    echo "    ⚠️  Failed to download ASN database, continuing without it..."
    TMP_ASN=""
fi

# Download City database (includes country data)
echo "[*] Downloading City database..."
TMP_CITY="/tmp/geolite-city.tar.gz"
if curl -fSL --progress-bar "${CITY_URL}" -o "${TMP_CITY}"; then
    if [[ -f "$TMP_CITY" && -s "$TMP_CITY" ]]; then
        SIZE=$(du -h "$TMP_CITY" | cut -f1)
        echo "    ✓ City database downloaded successfully (${SIZE})"
    else
        echo "    ⚠️  Downloaded file is empty, continuing without City database..."
        TMP_CITY=""
    fi
else
    echo "    ⚠️  Failed to download City database, continuing without it..."
    TMP_CITY=""
fi

# Extract ASN database
if [[ -n "$TMP_ASN" && -s "$TMP_ASN" ]]; then
    echo "[*] Extracting ASN database..."
    if sudo tar -xzf "$TMP_ASN" -C "$GEOIP_DIR" --strip-components=1 "*.mmdb" 2>/dev/null; then
        echo "    ✓ ASN database extracted successfully"
    else
        # Try alternative extraction method
        if sudo tar -xzf "$TMP_ASN" -C "$GEOIP_DIR" 2>/dev/null && \
           sudo find "$GEOIP_DIR" -name "GeoLite2-ASN.mmdb" -exec sudo mv {} "$GEOIP_DIR/" \; 2>/dev/null; then
            echo "    ✓ ASN database extracted successfully"
        else
            echo "    ⚠️  Failed to extract ASN database"
        fi
    fi
    sudo chmod 644 "$GEOIP_DIR/GeoLite2-ASN.mmdb" 2>/dev/null || true
    rm -f "$TMP_ASN"
fi

# Extract City database
if [[ -n "$TMP_CITY" && -s "$TMP_CITY" ]]; then
    echo "[*] Extracting City database..."
    if sudo tar -xzf "$TMP_CITY" -C "$GEOIP_DIR" --strip-components=1 "*.mmdb" 2>/dev/null; then
        echo "    ✓ City database extracted successfully"
    else
        # Try alternative extraction method
        if sudo tar -xzf "$TMP_CITY" -C "$GEOIP_DIR" 2>/dev/null && \
           sudo find "$GEOIP_DIR" -name "GeoLite2-City.mmdb" -exec sudo mv {} "$GEOIP_DIR/" \; 2>/dev/null; then
            echo "    ✓ City database extracted successfully"
        else
            echo "    ⚠️  Failed to extract City database"
        fi
    fi
    sudo chmod 644 "$GEOIP_DIR/GeoLite2-City.mmdb" 2>/dev/null || true
    rm -f "$TMP_CITY"
fi

# Ensure directory still exists (in case something went wrong)
sudo mkdir -p "$GEOIP_DIR" 2>/dev/null || true
sudo chmod 755 "$GEOIP_DIR" 2>/dev/null || true

# Update config with database paths after extraction (in case they were just downloaded)
if [[ -f "$CONFIG_FILE" ]]; then
    # Check if we need to update the config
    if [[ -f "$GEOIP_DIR/GeoLite2-ASN.mmdb" ]] || [[ -f "$GEOIP_DIR/GeoLite2-City.mmdb" ]]; then
        if command -v jq >/dev/null 2>&1; then
            UPDATED=false
            if [[ -f "$GEOIP_DIR/GeoLite2-ASN.mmdb" ]]; then
                sudo jq '.geoLiteAsnPath = "/var/lib/jetcamer/GeoLite2-ASN.mmdb"' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && \
                sudo mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE" && UPDATED=true
            fi
            if [[ -f "$GEOIP_DIR/GeoLite2-City.mmdb" ]]; then
                sudo jq '.geoLiteCountryPath = "/var/lib/jetcamer/GeoLite2-City.mmdb"' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && \
                sudo mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE" && UPDATED=true
            fi
            if [[ "$UPDATED" == "true" ]]; then
                echo "[*] Config updated with GeoLite database paths"
            fi
        fi
    fi
fi

# Final verification
if [[ -d "$GEOIP_DIR" ]]; then
    echo "[*] GeoIP directory verified: ${GEOIP_DIR}"
    ls -la "$GEOIP_DIR" 2>/dev/null || true
else
    echo "⚠️  Warning: GeoIP directory ${GEOIP_DIR} was not created"
fi

# ──────────────────────────────────────────────
# 8. Ensure log directory
# ──────────────────────────────────────────────
LOG_DIR="/var/log/jetcamer-agent"
echo "[*] Ensuring log directory exists: ${LOG_DIR}"
sudo mkdir -p "$LOG_DIR"
sudo chmod 755 "$LOG_DIR"

# ──────────────────────────────────────────────
# 9. Install systemd unit
# ──────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/jetcamer-agent.service"

echo "[*] Installing systemd service: ${SERVICE_FILE}"

sudo tee "$SERVICE_FILE" >/dev/null <<'EOF'
[Unit]
Description=JetCamer Analytics & Security Agent
After=network.target

[Service]
ExecStart=/opt/jetcamer-agent/jetcamer-agent
Restart=always
RestartSec=3
User=root
WorkingDirectory=/opt/jetcamer-agent
StandardOutput=append:/var/log/jetcamer-agent/agent.log
StandardError=append:/var/log/jetcamer-agent/agent-error.log

[Install]
WantedBy=multi-user.target
EOF

echo "[*] Reloading systemd and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable jetcamer-agent
sudo systemctl restart jetcamer-agent

# Wait a moment for service to start
sleep 3

# Try to get version from the running agent
echo "[*] Checking installed agent version..."
AGENT_VERSION="unknown"
if command -v strings >/dev/null 2>&1; then
    # Try to extract version from binary strings
    VERSION_FROM_BINARY=$(strings "$BIN_PATH" 2>/dev/null | grep -E "^[0-9]+\.[0-9]+\.[0-9]+$" | head -1)
    if [ -n "$VERSION_FROM_BINARY" ]; then
        AGENT_VERSION="$VERSION_FROM_BINARY"
    fi
fi

# Try to get version from agent endpoint (more reliable)
if curl -s http://127.0.0.1:9811/version >/dev/null 2>&1; then
    VERSION_FROM_API=$(curl -s http://127.0.0.1:9811/version 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$VERSION_FROM_API" ]; then
        AGENT_VERSION="$VERSION_FROM_API"
    fi
fi

# Also check from logs
VERSION_FROM_LOG=$(sudo journalctl -u jetcamer-agent --no-pager -n 10 2>/dev/null | grep -oE "version=[0-9]+\.[0-9]+\.[0-9]+" | head -1 | cut -d'=' -f2)
if [ -n "$VERSION_FROM_LOG" ]; then
    AGENT_VERSION="$VERSION_FROM_LOG"
fi

if [ "$AGENT_VERSION" != "unknown" ]; then
    echo "    ✓ Agent version: $AGENT_VERSION"
else
    echo "    ⚠️  Could not determine agent version"
fi

# ──────────────────────────────────────────────
# 10. Install GeoLite database update timer
# ──────────────────────────────────────────────
UPDATE_SCRIPT="/opt/jetcamer-agent/update-geolite.sh"
echo "[*] Installing GeoLite database update script..."

# Create update script directly
sudo tee "$UPDATE_SCRIPT" >/dev/null <<'UPDATESCRIPTEOF'
#!/usr/bin/env bash
set -euo pipefail

# GeoLite database update script
# Downloads and updates GeoLite2-ASN and GeoLite2-City databases

GEOIP_DIR="/var/lib/jetcamer"
CONFIG_FILE="/etc/jetcamer/agent.config.json"

# Get server base URL from config or use default
SERVER_BASE_URL="https://api.jetcamer.com"
if [[ -f "$CONFIG_FILE" ]] && command -v jq >/dev/null 2>&1; then
    # Try to extract from collectorUrl or use default
    COLLECTOR_URL=$(jq -r '.collectorUrl // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
    if [[ -n "$COLLECTOR_URL" ]]; then
        if [[ "$COLLECTOR_URL" =~ ^(https?://[^/]+) ]]; then
            SERVER_BASE_URL="${BASH_REMATCH[1]}"
        fi
    fi
fi

ASN_URL="${SERVER_BASE_URL}/download/geolite-asn.tar.gz"
CITY_URL="${SERVER_BASE_URL}/download/geolite-city.tar.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting GeoLite database update..."

# Ensure directory exists
sudo mkdir -p "$GEOIP_DIR" || exit 1

# Download ASN database
echo "[*] Downloading ASN database..."
TMP_ASN="/tmp/geolite-asn-$(date +%s).tar.gz"
if curl -fSL --progress-bar "${ASN_URL}" -o "${TMP_ASN}"; then
    if [[ -f "$TMP_ASN" && -s "$TMP_ASN" ]]; then
        echo "[*] Extracting ASN database..."
        if sudo tar -xzf "$TMP_ASN" -C "$GEOIP_DIR" --strip-components=1 "*.mmdb" 2>/dev/null || \
           (sudo tar -xzf "$TMP_ASN" -C "$GEOIP_DIR" 2>/dev/null && \
            sudo find "$GEOIP_DIR" -name "GeoLite2-ASN.mmdb" -exec sudo mv {} "$GEOIP_DIR/" \; 2>/dev/null); then
            sudo chmod 644 "$GEOIP_DIR/GeoLite2-ASN.mmdb" 2>/dev/null || true
            echo "    ✓ ASN database updated successfully"
        else
            echo "    ⚠️  Failed to extract ASN database"
        fi
        rm -f "$TMP_ASN"
    fi
else
    echo "    ⚠️  Failed to download ASN database"
    rm -f "$TMP_ASN"
fi

# Download City database
echo "[*] Downloading City database..."
TMP_CITY="/tmp/geolite-city-$(date +%s).tar.gz"
if curl -fSL --progress-bar "${CITY_URL}" -o "${TMP_CITY}"; then
    if [[ -f "$TMP_CITY" && -s "$TMP_CITY" ]]; then
        echo "[*] Extracting City database..."
        if sudo tar -xzf "$TMP_CITY" -C "$GEOIP_DIR" --strip-components=1 "*.mmdb" 2>/dev/null || \
           (sudo tar -xzf "$TMP_CITY" -C "$GEOIP_DIR" 2>/dev/null && \
            sudo find "$GEOIP_DIR" -name "GeoLite2-City.mmdb" -exec sudo mv {} "$GEOIP_DIR/" \; 2>/dev/null); then
            sudo chmod 644 "$GEOIP_DIR/GeoLite2-City.mmdb" 2>/dev/null || true
            echo "    ✓ City database updated successfully"
        else
            echo "    ⚠️  Failed to extract City database"
        fi
        rm -f "$TMP_CITY"
    fi
else
    echo "    ⚠️  Failed to download City database"
    rm -f "$TMP_CITY"
fi

# Restart agent to pick up new databases (if service exists)
if systemctl is-active --quiet jetcamer-agent 2>/dev/null; then
    echo "[*] Restarting jetcamer-agent service to load updated databases..."
    sudo systemctl restart jetcamer-agent || true
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] GeoLite database update completed"
UPDATESCRIPTEOF

sudo chmod +x "$UPDATE_SCRIPT"
echo "    ✓ Update script installed"

# Create systemd timer for daily updates
TIMER_FILE="/etc/systemd/system/jetcamer-geolite-update.timer"
SERVICE_FILE_UPDATE="/etc/systemd/system/jetcamer-geolite-update.service"

if [[ -f "$UPDATE_SCRIPT" ]]; then
    echo "[*] Setting up daily GeoLite database updates..."
    
    # Create service file
    sudo tee "$SERVICE_FILE_UPDATE" >/dev/null <<'EOF'
[Unit]
Description=Update GeoLite databases for JetCamer Agent
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/jetcamer-agent/update-geolite.sh
User=root
StandardOutput=append:/var/log/jetcamer-agent/geolite-update.log
StandardError=append:/var/log/jetcamer-agent/geolite-update-error.log
EOF

    # Create timer file (runs daily at 2 AM)
    sudo tee "$TIMER_FILE" >/dev/null <<'EOF'
[Unit]
Description=Daily GeoLite database update timer for JetCamer Agent
Requires=jetcamer-geolite-update.service

[Timer]
OnCalendar=daily
OnCalendar=*-*-* 02:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable jetcamer-geolite-update.timer
    sudo systemctl start jetcamer-geolite-update.timer
    
    echo "    ✓ Daily GeoLite database updates enabled (runs at 2 AM daily)"
    echo "    Check status with: sudo systemctl status jetcamer-geolite-update.timer"
fi

echo
echo "──────────────────────────────────────────────"
echo "   ✓ JetCamer Agent installed and running"
if [ "$AGENT_VERSION" != "unknown" ]; then
    echo "   📦 Installed version: $AGENT_VERSION"
fi
echo "──────────────────────────────────────────────"
echo
echo "Check status with:"
echo "  sudo systemctl status jetcamer-agent"
echo
echo "Check version with:"
echo "  curl http://127.0.0.1:9811/version"
echo "  sudo journalctl -u jetcamer-agent | grep 'version='"
echo
echo "Default local web endpoints (on the server):"
echo "  curl http://127.0.0.1:9811/health"
echo "  curl http://127.0.0.1:9811/version"
echo "  curl http://127.0.0.1:9811/live"
echo "  curl http://127.0.0.1:9811/security"
echo "  curl http://127.0.0.1:9811/internal/s3-validate  # Validate S3 configuration"
echo
