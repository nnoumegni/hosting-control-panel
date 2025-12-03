#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

# Read current version
VERSION_FILE="$ROOT_DIR/VERSION"
if [ ! -f "$VERSION_FILE" ]; then
    echo "❌ VERSION file not found. Creating with default version..."
    echo "4.0.0" > "$VERSION_FILE"
fi

CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d ' \n')
echo "[*] Current version: $CURRENT_VERSION"

# Auto-increment patch version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]:-0}"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"

# Update VERSION file
echo "$NEW_VERSION" > "$VERSION_FILE"
echo "[*] Updated version to: $NEW_VERSION"

echo "[*] Tidying Go modules..."
go mod tidy

mkdir -p "$ROOT_DIR/bin"

# Build with version injected via ldflags
echo "[*] Building linux/amd64..."
GOOS=linux GOARCH=amd64 go build -ldflags "-X github.com/jetcamer/agent-go/internal/version.Version=$NEW_VERSION" -o "$ROOT_DIR/bin/jetcamer-agent-linux-amd64" ./cmd/agent

echo "[*] Building linux/arm64..."
GOOS=linux GOARCH=arm64 go build -ldflags "-X github.com/jetcamer/agent-go/internal/version.Version=$NEW_VERSION" -o "$ROOT_DIR/bin/jetcamer-agent-linux-arm64" ./cmd/agent

echo "[✓] Binaries built in bin/ with version $NEW_VERSION"
