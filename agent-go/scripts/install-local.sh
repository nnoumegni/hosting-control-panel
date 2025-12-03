#!/usr/bin/env bash
set -euo pipefail

BIN_PATH="${1:-./bin/jetcamer-agent-linux-amd64}"

if [[ ! -x "$BIN_PATH" ]]; then
  echo "Binary not found or not executable: $BIN_PATH" >&2
  exit 1
fi

echo "[*] Installing agent binary to /opt/jetcamer-agent/jetcamer-agent"
sudo mkdir -p /opt/jetcamer-agent
sudo cp "$BIN_PATH" /opt/jetcamer-agent/jetcamer-agent
sudo chmod +x /opt/jetcamer-agent/jetcamer-agent

echo "[*] Creating /etc/jetcamer/agent.config.json if missing"
sudo mkdir -p /etc/jetcamer
if [[ ! -f /etc/jetcamer/agent.config.json ]]; then
  cat <<EOF | sudo tee /etc/jetcamer/agent.config.json >/dev/null
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
  "firewallIpsetName": "jetcamer_blacklist",
  "firewallNftTable": "inet",
  "firewallNftChain": "jetcamer_drop",
  "awsRegion": "",
  "awsNetworkAclId": "",
  "awsNetworkAclDenyRuleBase": 200
}
EOF
fi

echo "[*] Installing systemd unit"
sudo bash -c 'cat > /etc/systemd/system/jetcamer-agent.service' <<'EOF'
[Unit]
Description=JetCamer Analytics & Security Agent
After=network.target

[Service]
ExecStart=/opt/jetcamer-agent/jetcamer-agent
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF

echo "[*] Reloading systemd and starting service"
sudo systemctl daemon-reload
sudo systemctl enable jetcamer-agent
sudo systemctl restart jetcamer-agent

echo "[✓] JetCamer agent installed and started."
