/**
 * Custom HTTPS server for Next.js
 * Enables HTTPS support in development and production
 */

const { createServer: createHttpsServer } = require('https');
const { createServer: createHttpServer } = require('http');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5010', 10);

// Load environment variables
require('dotenv').config({ path: resolve(__dirname, '.env') });

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  let server;
  let isHttps = false;

  // Check if SSL certificates are configured
  const sslCertPath = process.env.SSL_CERT_PATH;
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCaPath = process.env.SSL_CA_PATH;

  if (sslCertPath && sslKeyPath) {
    // HTTPS mode
    try {
      const options = {
        cert: readFileSync(sslCertPath),
        key: readFileSync(sslKeyPath),
      };

      // Optional: Certificate Authority chain
      if (sslCaPath) {
        options.ca = [readFileSync(sslCaPath)];
      }

      server = createHttpsServer(options);
      isHttps = true;
      console.log('✅ Using HTTPS with SSL certificates');
      console.log(`   Certificate: ${sslCertPath}`);
      console.log(`   Key: ${sslKeyPath}`);
    } catch (error) {
      console.error('❌ Failed to load SSL certificates:', error.message);
      console.error('   Falling back to HTTP');
      server = createHttpServer();
    }
  } else {
    // HTTP mode (default)
    console.warn('⚠️  Running in HTTP mode. SSL certificates not configured.');
    console.warn('   Set SSL_CERT_PATH and SSL_KEY_PATH to enable HTTPS');
    server = createHttpServer();
  }

  server.on('request', (req, res) => {
    handle(req, res);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    const protocol = isHttps ? 'https' : 'http';
    console.log(`> Ready on ${protocol}://${hostname}:${port}`);
  });
});

