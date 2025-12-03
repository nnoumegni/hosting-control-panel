#!/bin/bash

# Complete setup script for development HTTPS
# Generates certificates and updates .env file

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$API_DIR/.env"

echo "🔐 Setting up HTTPS for development..."

# Generate certificates
"$API_DIR/scripts/generate-dev-cert.sh"

# Get absolute paths
CERT_PATH="$API_DIR/certs/cert.pem"
KEY_PATH="$API_DIR/certs/key.pem"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "📝 Creating .env file..."
  cp "$API_DIR/env.example" "$ENV_FILE"
fi

# Check if SSL paths are already set
if grep -q "SSL_CERT_PATH" "$ENV_FILE"; then
  echo ""
  echo "⚠️  SSL_CERT_PATH already exists in .env"
  echo "   Updating existing values..."
  # Remove existing SSL lines
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' '/^SSL_CERT_PATH=/d' "$ENV_FILE"
    sed -i '' '/^SSL_KEY_PATH=/d' "$ENV_FILE"
    sed -i '' '/^SSL_CA_PATH=/d' "$ENV_FILE"
  else
    # Linux
    sed -i '/^SSL_CERT_PATH=/d' "$ENV_FILE"
    sed -i '/^SSL_KEY_PATH=/d' "$ENV_FILE"
    sed -i '/^SSL_CA_PATH=/d' "$ENV_FILE"
  fi
fi

# Add SSL configuration
echo "" >> "$ENV_FILE"
echo "# HTTPS/TLS Configuration (Development)" >> "$ENV_FILE"
echo "SSL_CERT_PATH=$CERT_PATH" >> "$ENV_FILE"
echo "SSL_KEY_PATH=$KEY_PATH" >> "$ENV_FILE"

echo ""
echo "✅ HTTPS setup complete!"
echo ""
echo "Configuration added to: $ENV_FILE"
echo ""
echo "To start the server with HTTPS:"
echo "  yarn start:api"
echo ""
echo "The server will be available at: https://localhost:4000"
echo ""
echo "⚠️  Browser Security Warning:"
echo "   Browsers will show a security warning for self-signed certificates."
echo "   This is normal for development. Click 'Advanced' → 'Proceed to localhost' to continue."

