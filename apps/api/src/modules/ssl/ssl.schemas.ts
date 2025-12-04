import { z } from 'zod';

export const instanceIdQuerySchema = z.object({
  instanceId: z.string().optional(),
});

export const domainQuerySchema = z.object({
  domain: z.string().optional(),
});

export const dnsProviderCredentialsSchema = z.record(z.string());

export const dnsProviderSchema = z.object({
  provider: z.enum(['webhook', 'route53', 'cloudflare']),
  credentials: dnsProviderCredentialsSchema,
});

export const issueCertificateBodySchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
  altNames: z.array(z.string()).optional(),
  challengeType: z.enum(['http', 'dns']).optional().default('http'),
  dnsProvider: dnsProviderSchema.optional(),
});

export const renewCertificateBodySchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
  challengeType: z.enum(['http', 'dns']).optional(),
  dnsProvider: dnsProviderSchema.optional(),
});

export const revokeCertificateBodySchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
});

export const configureACMEAccountBodySchema = z.object({
  email: z.string().email('Valid email is required'),
  useStaging: z.boolean().optional().default(false),
});

export const checkDomainQuerySchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
});

export const downloadCertificateQuerySchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
  format: z.enum(['json', 'pem', 'zip']).optional().default('json'),
});

export type IssueCertificateBody = z.infer<typeof issueCertificateBodySchema>;
export type RenewCertificateBody = z.infer<typeof renewCertificateBodySchema>;
export type RevokeCertificateBody = z.infer<typeof revokeCertificateBodySchema>;
export type ConfigureACMEAccountBody = z.infer<typeof configureACMEAccountBodySchema>;

