import { z } from 'zod';

import {
  FirewallRuleAction,
  FirewallRuleProtocol,
  FirewallRuleStatus,
  FirewallSettings,
} from '../types/firewall.js';

const portNumber = z.number().int().min(0).max(65535);

export const firewallPortRangeSchema = z
  .object({
    from: portNumber,
    to: portNumber,
  })
  .refine((value) => value.to >= value.from, {
    message: 'Port range "to" must be greater than or equal to "from"',
    path: ['to'],
  });

export const firewallRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(3),
  description: z.string().max(500).optional(),
  direction: z.enum(['ingress', 'egress']),
  protocol: z.enum(['tcp', 'udp', 'icmp', 'all']),
  portRange: firewallPortRangeSchema.nullable(),
  source: z.string().min(1).nullable(),
  destination: z.string().min(1).nullable(),
  action: z.enum(['allow', 'deny']),
  status: z.enum(['enabled', 'disabled']),
  syncStatus: z.enum(['synced', 'pending', 'failed', 'not_applicable']),
  lastSyncAt: z.string().nullable(),
  syncError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createFirewallRuleSchema = firewallRuleSchema
  .omit({
    id: true,
    source: true,
    destination: true,
    portRange: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    syncStatus: true,
    lastSyncAt: true,
    syncError: true,
  })
  .extend({
    portRange: firewallPortRangeSchema.nullable().optional(),
    source: z.string().min(1).nullable().optional(),
    destination: z.string().min(1).nullable().optional(),
    action: z.enum(['allow', 'deny']).default('allow'),
    status: z.enum(['enabled', 'disabled']).default('enabled'),
  });

export const updateFirewallRuleSchema = firewallRuleSchema
  .pick({
    name: true,
    description: true,
    direction: true,
    protocol: true,
    portRange: true,
    source: true,
    destination: true,
    action: true,
    status: true,
  })
  .partial();

export const firewallRuleIdSchema = z.object({
  id: z.string().length(24).regex(/^[a-fA-F0-9]{24}$/),
});

export type FirewallRuleSchema = z.infer<typeof firewallRuleSchema>;
export type CreateFirewallRuleInput = z.infer<typeof createFirewallRuleSchema>;
export type UpdateFirewallRuleInput = z.infer<typeof updateFirewallRuleSchema>;
export type FirewallRuleProtocolEnum = FirewallRuleProtocol;
export type FirewallRuleStatusEnum = FirewallRuleStatus;
export type FirewallRuleActionEnum = FirewallRuleAction;

export const firewallSettingsSchema: z.ZodType<FirewallSettings> = z.object({
  securityGroupId: z.string().min(1).nullable(),
  networkAclId: z.string().min(1).nullable(),
  awsAccessKeyId: z.string().min(1).nullable(),
  hasAwsSecretAccessKey: z.boolean(),
  updatedAt: z.string().nullable(),
});

const nullableString = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .or(z.literal('').transform(() => null));

export const updateFirewallSettingsSchema = z.object({
  securityGroupId: nullableString.optional(),
  networkAclId: nullableString.optional(),
  awsAccessKeyId: nullableString.optional(),
  awsSecretAccessKey: z.string().trim().min(1).optional(),
  clearAwsSecretAccessKey: z.boolean().optional(),
});

export type FirewallSettingsSchema = z.infer<typeof firewallSettingsSchema>;
export type UpdateFirewallSettingsSchema = z.infer<typeof updateFirewallSettingsSchema>;

