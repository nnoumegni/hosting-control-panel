import { z } from 'zod';

export const dnsLookupQuerySchema = z.object({
  hostname: z.string().min(1, 'Hostname is required'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'PTR', 'ANY']).default('A'),
  instanceId: z.string().optional(),
});

export const dnsDiagnosticsParamsSchema = z.object({
  hostname: z.string().min(1, 'Hostname is required'),
  instanceId: z.string().optional(),
});

