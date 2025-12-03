import { z } from 'zod';

import { firewallSettingsSchema, updateFirewallSettingsSchema } from '@hosting/common';

export const updateFirewallSettingsValidation = {
  body: updateFirewallSettingsSchema,
};

export type FirewallSettingsResponse = z.infer<typeof firewallSettingsSchema>;
export type UpdateFirewallSettingsBody = z.infer<typeof updateFirewallSettingsSchema>;

