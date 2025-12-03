# HTTPS Setup Guide

The API server supports both HTTP and HTTPS. By default, it runs in HTTP mode. To enable HTTPS, you need to provide SSL certificates.

## Quick Start

### 1. Get SSL Certificates

You can obtain SSL certificates from:
- **Let's Encrypt** (free, automated): Use `certbot` to generate certificates
- **Commercial CA**: Purchase certificates from providers like DigiCert, GlobalSign, etc.
- **Self-signed** (development only): Generate with `openssl`

### 2. Configure Environment Variables

Add these to your `.env` file:

```bash
# Required for HTTPS
SSL_CERT_PATH=/path/to/your/certificate.crt
SSL_KEY_PATH=/path/to/your/private.key

# Optional: Certificate Authority chain (for intermediate certificates)
SSL_CA_PATH=/path/to/ca-bundle.crt
```

### 3. Start the Server

The server will automatically detect the certificates and start in HTTPS mode:

```bash
yarn start:api
```

You should see in the logs:
```
Using HTTPS with SSL certificates
API server started { baseUrl: 'https://localhost:4000', protocol: 'https', port: 4000, https: true }
```

## Examples

### Using Let's Encrypt (Recommended for Production)

1. Install certbot:
```bash
sudo apt-get update
sudo apt-get install certbot
```

2. Generate certificates:
```bash
sudo certbot certonly --standalone -d yourdomain.com
```

3. Configure environment:
```bash
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

4. **Important**: Certbot certificates expire every 90 days. Set up auto-renewal:
```bash
sudo certbot renew --dry-run
```

### Using Self-Signed Certificate (Development Only)

1. Generate a self-signed certificate:
```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem \
  -out cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

2. Configure environment:
```bash
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

3. **Note**: Browsers will show a security warning for self-signed certificates. This is normal for development.

### Using AWS Certificate Manager (ACM)

If running on AWS, you can use ACM certificates:

1. Request a certificate in ACM
2. Export the certificate (requires AWS CLI):
```bash
aws acm get-certificate --certificate-arn <arn> --region us-east-1 > cert.pem
aws acm export-certificate --certificate-arn <arn> --passphrase <pass> > key.pem
```

3. Configure environment with the exported paths

## WebSocket with HTTPS

When HTTPS is enabled, WebSocket connections automatically use `wss://` (secure WebSocket):

- **Agent connections**: `wss://{public-ip}/agent`
- **Dashboard connections**: `wss://{api-url}/analytics-ws`

The frontend will automatically detect HTTPS and use `wss://` instead of `ws://`.

## Troubleshooting

### Certificate Not Found

If you see:
```
Failed to load SSL certificates, falling back to HTTP
```

Check:
1. Certificate paths are correct and absolute
2. Files are readable by the Node.js process
3. Certificate and key files are valid

### Port 443 (Standard HTTPS Port)

To use port 443 (standard HTTPS port), you may need root privileges:

```bash
PORT=443 yarn start:api
```

Or use a reverse proxy (nginx, Apache) to handle SSL termination and forward to the app on a different port.

### Certificate Expiration

Let's Encrypt certificates expire every 90 days. Set up auto-renewal:

```bash
# Add to crontab
0 0 * * * certbot renew --quiet && systemctl reload your-app
```

## Fallback Behavior

If SSL certificates are not configured or fail to load, the server automatically falls back to HTTP mode. This ensures the server always starts, even if certificates are misconfigured.

