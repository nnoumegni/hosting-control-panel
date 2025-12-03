import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import type { FirewallSettingsService } from './firewall.settings.service.js';
import type { UpdateFirewallSettingsBody } from './firewall.settings.schemas.js';

export const createFirewallSettingsController = (service: FirewallSettingsService) => ({
  getSettings: asyncHandler(async (_req: Request, res: Response) => {
    const settings = await service.getSettings();
    res.json(
      settings ?? {
        securityGroupId: null,
        networkAclId: null,
        updatedAt: null,
      },
    );
  }),

  updateSettings: asyncHandler(async (req: Request<unknown, unknown, UpdateFirewallSettingsBody>, res: Response) => {
    const {
      securityGroupId,
      networkAclId,
      awsAccessKeyId,
      awsSecretAccessKey,
      clearAwsSecretAccessKey,
    } = req.body;

    const input = {
      securityGroupId: securityGroupId ?? null,
      networkAclId: networkAclId ?? null,
      awsAccessKeyId: awsAccessKeyId ?? null,
      awsSecretAccessKey,
      clearAwsSecretAccessKey: clearAwsSecretAccessKey ?? false,
    };
    const updated = await service.updateSettings(input);
    res.json(updated);
  }),
});

