import { z } from 'zod';

import { paginationQuerySchema } from './pagination.js';

export const objectIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/);

export const hostingPlanSchema = z.object({
  id: z.string(),
  name: z.string().min(3),
  description: z.string().max(500).optional(),
  diskQuotaMb: z.number().int().positive(),
  bandwidthQuotaGb: z.number().int().positive(),
  maxDomains: z.number().int().positive(),
  maxDatabases: z.number().int().nonnegative(),
  maxEmailAccounts: z.number().int().nonnegative(),
  priceMonthly: z.number().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createHostingPlanSchema = hostingPlanSchema.pick({
  name: true,
  description: true,
  diskQuotaMb: true,
  bandwidthQuotaGb: true,
  maxDomains: true,
  maxDatabases: true,
  maxEmailAccounts: true,
  priceMonthly: true,
});

export const updateHostingPlanSchema = createHostingPlanSchema.partial();

export const hostingAccountSchema = z.object({
  id: z.string(),
  username: z.string().min(3),
  primaryDomain: z.string().min(3),
  planId: z.string(),
  ownerId: z.string(),
  ownerRole: z.enum(['superadmin', 'administrator', 'reseller', 'customer']),
  status: z.enum(['active', 'suspended', 'pending', 'deprovisioned']),
  createdAt: z.string(),
  updatedAt: z.string(),
  suspendedAt: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const createHostingAccountSchema = hostingAccountSchema.pick({
  username: true,
  primaryDomain: true,
  planId: true,
  ownerId: true,
  ownerRole: true,
});

export const updateHostingAccountSchema = hostingAccountSchema
  .pick({ primaryDomain: true, planId: true, status: true, metadata: true })
  .partial();

export const listAccountsQuerySchema = paginationQuerySchema.extend({
  ownerId: z.string().optional(),
  status: z.enum(['active', 'suspended', 'pending', 'deprovisioned']).optional(),
});


