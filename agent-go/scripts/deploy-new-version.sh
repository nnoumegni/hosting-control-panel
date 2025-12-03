#!/usr/bin/env bash
# Script to build and deploy the new agent version with S3 upload support

set -e

REMOTE_HOST="${REMOTE_HOST:-ubuntu@44.248.12.249}"
SSH_KEY="${SSH_KEY:-/Users/nnoumegni/Downloads/jetcamer.pem}"
ARCH="${ARCH:-amd64}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================="
echo "Building and Deploying New Agent Version"
echo "=========================================="
echo ""

# Check if Go is available
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed or not in PATH"
    echo ""
    echo "Options:"
    echo "1. Install Go: brew install go"
    echo "2. Build on remote server (see option below)"
    echo ""
    read -p "Do you want to build on the remote server instead? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Building on remote server..."
        ssh -i "$SSH_KEY" "$REMOTE_HOST" << 'REMOTE_BUILD'
            set -e
            cd /tmp
            # Check if Go is installed
            if ! command -v go &> /dev/null; then
                echo "Installing Go on remote server..."
                wget -q https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
                sudo rm -rf /usr/local/go
                sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
                export PATH=$PATH:/usr/local/go/bin
            fi
            
            # You'll need to upload the source code or clone it
            echo "⚠️  You need to provide the source code on the remote server"
            echo "    Either:"
            echo "    1. Upload the source code to the remote server"
            echo "    2. Or clone from your repository"
            exit 1
REMOTE_BUILD
        exit 1
    else
        exit 1
    fi
fi

echo "[*] Building agent binary..."
mkdir -p "$ROOT_DIR/bin"

# Build for Linux
GOOS=linux GOARCH="$ARCH" go build -o "$ROOT_DIR/bin/jetcamer-agent-linux-${ARCH}" ./cmd/agent

if [[ ! -f "$ROOT_DIR/bin/jetcamer-agent-linux-${ARCH}" ]]; then
    echo "❌ Build failed - binary not found"
    exit 1
fi

echo "✓ Binary built: $ROOT_DIR/bin/jetcamer-agent-linux-${ARCH}"
echo ""

# Upload to remote server
echo "[*] Uploading binary to remote server..."
scp -i "$SSH_KEY" \
    "$ROOT_DIR/bin/jetcamer-agent-linux-${ARCH}" \
    "$REMOTE_HOST:/tmp/jetcamer-agent-new"

echo "✓ Binary uploaded"
echo ""

# Deploy on remote server
echo "[*] Deploying on remote server..."
ssh -i "$SSH_KEY" "$REMOTE_HOST" << 'DEPLOY'
    set -e
    echo "Stopping agent service..."
    sudo systemctl stop jetcamer-agent || true
    
    echo "Backing up old binary..."
    sudo cp /opt/jetcamer-agent/jetcamer-agent /opt/jetcamer-agent/jetcamer-agent.backup.$(date +%Y%m%d_%H%M%S) || true
    
    echo "Installing new binary..."
    sudo cp /tmp/jetcamer-agent-new /opt/jetcamer-agent/jetcamer-agent
    sudo chmod +x /opt/jetcamer-agent/jetcamer-agent
    
    echo "Starting agent service..."
    sudo systemctl start jetcamer-agent
    
    echo "Waiting for service to start..."
    sleep 2
    
    echo "Checking service status..."
    sudo systemctl status jetcamer-agent --no-pager -l | head -20
    
    echo ""
    echo "✓ Deployment complete!"
    echo ""
    echo "Check logs with: sudo journalctl -u jetcamer-agent -f"
DEPLOY

echo ""
echo "=========================================="
echo "✓ Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Check logs: ssh $REMOTE_HOST -i $SSH_KEY 'sudo journalctl -u jetcamer-agent -f'"
echo "2. Look for: 'S3 uploader initialized' and 'batch sink using internal route'"
echo "3. Test endpoint: ssh $REMOTE_HOST -i $SSH_KEY 'curl http://127.0.0.1:9811/health'"

