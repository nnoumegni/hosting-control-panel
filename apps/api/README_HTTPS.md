# Development HTTPS Setup

Quick guide to enable HTTPS for local development.

## Quick Start

### Option 1: Automated Setup (Recommended)

Run the complete setup script that generates certificates and configures your `.env.local`:

```bash
yarn cert:setup
```

This will:
1. Generate a self-signed certificate
2. Update your `.env.local` file with the certificate paths
3. Show you how to start the server

### Option 2: Manual Setup

1. **Generate certificates:**
   ```bash
   yarn cert:generate
   ```

2. **Add to your `.env.local` file:**
   ```bash
   SSL_CERT_PATH=./certs/cert.pem
   SSL_KEY_PATH=./certs/key.pem
   ```

3. **Start the server:**
   ```bash
   yarn start:api
   ```

## Using the Certificates

The generated certificates work for:
- `localhost`
- `127.0.0.1`
- `::1` (IPv6 localhost)

## Browser Security Warning

When you first visit `https://localhost:4000`, your browser will show a security warning because the certificate is self-signed. This is **normal for development**.

**To proceed:**
1. Click "Advanced" or "Show Details"
2. Click "Proceed to localhost" or "Accept the Risk and Continue"

**Chrome/Edge:**
- Click "Advanced" → "Proceed to localhost (unsafe)"

**Firefox:**
- Click "Advanced" → "Accept the Risk and Continue"

**Safari:**
- Click "Show Details" → "visit this website" → "Visit Website"

## Certificate Details

- **Validity:** 365 days
- **Key Size:** 2048 bits
- **Subject:** `CN=localhost`
- **SAN (Subject Alternative Names):** 
  - `DNS:localhost`
  - `DNS:*.localhost`
  - `IP:127.0.0.1`
  - `IP:::1`

## Regenerating Certificates

To regenerate certificates (e.g., if they expire):

```bash
yarn cert:generate
```

The old certificates will be overwritten.

## Troubleshooting

### "Permission denied" error

Make sure the script is executable:
```bash
chmod +x scripts/generate-dev-cert.sh
```

### Certificate not found

Make sure you're running the command from the `apps/api` directory, or use absolute paths in your `.env.local`.

### WebSocket connection fails

When using HTTPS, make sure:
- The frontend uses `https://` for the API URL
- WebSocket connections use `wss://` (automatically handled by the frontend)

## Production

⚠️ **Never use self-signed certificates in production!**

For production, use:
- Let's Encrypt (free, automated)
- Commercial CA certificates
- AWS Certificate Manager (if on AWS)

See `HTTPS_SETUP.md` for production setup instructions.

