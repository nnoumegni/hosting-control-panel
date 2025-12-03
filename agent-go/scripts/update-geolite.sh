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


