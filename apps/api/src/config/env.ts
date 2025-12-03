import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the api directory
loadDotenv({ path: resolve(__dirname, '../../.env') });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).or(z.literal('local')).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),
  MONGODB_URI: z.string().min(1),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  AWS_ACCOUNT_ID: z.string().min(1).optional(),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean)),
  AUTH_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(604800),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FIREWALL_SECURITY_GROUP_ID: z.string().optional(),
  FIREWALL_NETWORK_ACL_ID: z.string().optional(),
  FIREWALL_CREDENTIAL_PASSPHRASE: z.string().min(16).optional(),
  ENABLE_SWAGGER: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1')
    .pipe(z.boolean().default(true)),
  // HTTPS/TLS Configuration (optional)
  SSL_CERT_PATH: z.string().optional(),
  SSL_KEY_PATH: z.string().optional(),
  SSL_CA_PATH: z.string().optional(), // Optional: Certificate Authority chain
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;

export type Environment = typeof env;
