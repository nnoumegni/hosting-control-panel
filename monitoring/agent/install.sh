#!/usr/bin/env bash
set -e

BINARY="./dist/webagent"
INSTALL_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/webagent.service"

echo "📦 Installing Web Agent..."

# Copy binary
cp $BINARY $INSTALL_DIR/
chmod +x $INSTALL_DIR/webagent

# Copy systemd unit
cp systemd/agent.service $SERVICE_FILE

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable webagent
systemctl start webagent

echo "✅ Web Agent installed and running"
systemctl status webagent --no-pager
