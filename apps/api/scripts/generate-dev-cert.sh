#!/bin/bash

# Generate self-signed SSL certificate for development
# This creates a certificate that works for localhost and 127.0.0.1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERTS_DIR="$API_DIR/certs"

echo "🔐 Generating self-signed SSL certificate for development..."

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Generate private key
echo "📝 Generating private key..."
openssl genrsa -out "$CERTS_DIR/key.pem" 2048

# Generate certificate signing request and certificate
echo "📝 Generating certificate..."
openssl req -new -x509 -key "$CERTS_DIR/key.pem" -out "$CERTS_DIR/cert.pem" -days 365 \
  -subj "/C=US/ST=Development/L=Local/O=Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"

# Set appropriate permissions
chmod 600 "$CERTS_DIR/key.pem"
chmod 644 "$CERTS_DIR/cert.pem"

echo ""
echo "✅ Certificate generated successfully!"
echo ""
echo "Certificate files:"
echo "  - Certificate: $CERTS_DIR/cert.pem"
echo "  - Private Key: $CERTS_DIR/key.pem"
echo ""
echo "To enable HTTPS, add these to your .env file:"
echo "  SSL_CERT_PATH=$CERTS_DIR/cert.pem"
echo "  SSL_KEY_PATH=$CERTS_DIR/key.pem"
echo ""
echo "⚠️  Note: Browsers will show a security warning for self-signed certificates."
echo "   This is normal for development. Click 'Advanced' → 'Proceed to localhost' to continue."

