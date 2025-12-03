import { z } from 'zod';

import {
  createFirewallRuleSchema,
  firewallRuleIdSchema,
  updateFirewallRuleSchema,
} from '@hosting/common';

const nonEmpty = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine((value) => Object.keys(value).length > 0, {
    message: 'Body must include at least one field',
  });

export const createFirewallRuleValidation = {
  body: createFirewallRuleSchema,
};

export const updateFirewallRuleValidation = {
  params: firewallRuleIdSchema,
  body: nonEmpty(updateFirewallRuleSchema),
};

export const firewallRuleParamsValidation = {
  params: firewallRuleIdSchema,
};

export type CreateFirewallRuleBody = z.infer<typeof createFirewallRuleSchema>;
export type UpdateFirewallRuleBody = z.infer<typeof updateFirewallRuleSchema>;
export type FirewallRuleParams = z.infer<typeof firewallRuleIdSchema>;

