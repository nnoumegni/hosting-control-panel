#!/usr/bin/env bash
set -e

INSTALL_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/webagent.service"

echo "🧹 Uninstalling Web Agent..."

systemctl stop webagent || true
systemctl disable webagent || true
rm -f $SERVICE_FILE
systemctl daemon-reload

rm -f $INSTALL_DIR/webagent

echo "✅ Web Agent removed"
