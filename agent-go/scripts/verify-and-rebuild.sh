#!/usr/bin/env bash
# Verify the code changes and provide rebuild instructions

echo "=== Verifying Code Changes ==="
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Check if the new code exists in source
echo "1. Checking source code for new changes:"
echo "   - Checking sinks.go for internal route:"
if grep -q "internal route\|internal/batch" "$ROOT_DIR/internal/sinks/sinks.go"; then
    echo "      ✓ Found 'internal route' in sinks.go"
else
    echo "      ❌ NOT FOUND - code changes missing!"
fi

echo "   - Checking for S3 upload module:"
if [ -f "$ROOT_DIR/internal/s3upload/s3upload.go" ]; then
    echo "      ✓ S3 upload module exists"
    if grep -q "cyber-agent-logs" "$ROOT_DIR/internal/s3upload/s3upload.go"; then
        echo "      ✓ Contains 'cyber-agent-logs'"
    else
        echo "      ❌ Missing 'cyber-agent-logs'"
    fi
else
    echo "      ❌ S3 upload module NOT FOUND!"
fi

echo "   - Checking main.go for S3 uploader:"
if grep -q "s3upload\|S3Uploader" "$ROOT_DIR/cmd/agent/main.go"; then
    echo "      ✓ main.go includes S3 uploader"
else
    echo "      ❌ main.go missing S3 uploader initialization"
fi

echo "   - Checking server.go for internal route:"
if grep -q "internal/batch\|s3upload" "$ROOT_DIR/internal/server/server.go"; then
    echo "      ✓ server.go has internal route handler"
else
    echo "      ❌ server.go missing internal route"
fi

echo ""
echo "2. Checking go.mod for S3 dependency:"
if grep -q "service/s3" "$ROOT_DIR/go.mod"; then
    echo "   ✓ S3 SDK dependency found in go.mod"
else
    echo "   ❌ S3 SDK dependency MISSING from go.mod"
fi

echo ""
echo "=== Rebuild Instructions ==="
echo ""
echo "If all checks pass above, rebuild the binary:"
echo ""
echo "  cd $ROOT_DIR"
echo "  go mod tidy"
echo "  GOOS=linux GOARCH=amd64 go build -o bin/jetcamer-agent-linux-amd64 ./cmd/agent"
echo ""
echo "Then deploy:"
echo "  scp -i ~/Downloads/jetcamer.pem bin/jetcamer-agent-linux-amd64 ubuntu@44.248.12.249:/tmp/jetcamer-agent-new"
echo "  ssh ubuntu@44.248.12.249 -i ~/Downloads/jetcamer.pem"
echo "  sudo systemctl stop jetcamer-agent"
echo "  sudo cp /tmp/jetcamer-agent-new /opt/jetcamer-agent/jetcamer-agent"
echo "  sudo chmod +x /opt/jetcamer-agent/jetcamer-agent"
echo "  sudo systemctl start jetcamer-agent"
echo ""

