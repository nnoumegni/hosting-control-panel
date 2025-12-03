import { z } from 'zod';

export const instanceIdQuerySchema = z.object({
  instanceId: z.string().optional(),
});

export const domainQuerySchema = z.object({
  domain: z.string().optional(),
});

export const issueCertificateBodySchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
});

export const renewCertificateBodySchema = z.object({
  domain: z.string().min(1, 'Domain is required'),
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

export type IssueCertificateBody = z.infer<typeof issueCertificateBodySchema>;
export type RenewCertificateBody = z.infer<typeof renewCertificateBodySchema>;
export type RevokeCertificateBody = z.infer<typeof revokeCertificateBodySchema>;
export type ConfigureACMEAccountBody = z.infer<typeof configureACMEAccountBodySchema>;

