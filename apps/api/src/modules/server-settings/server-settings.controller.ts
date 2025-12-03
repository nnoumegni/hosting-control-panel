import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import { env } from '../../config/env.js';
import { getEc2Region } from '../../shared/aws/ec2-instance-detection.js';
import { ServerSettingsDiscoveryService } from './server-settings.discovery.js';
import type { ServerSettingsService } from './server-settings.service.js';
import type { UpdateServerSettingsBody } from './server-settings.schemas.js';

export const createServerSettingsController = (service: ServerSettingsService) => {
  const discoveryService = new ServerSettingsDiscoveryService();

  return {
    getSettings: asyncHandler(async (_req: Request, res: Response) => {
      let settings = await service.getSettings();
      
      // If no settings or region is missing, try to detect from EC2 metadata or use env var
      if (!settings || !settings.awsRegion) {
        let detectedRegion: string | null = null;
        try {
          detectedRegion = await getEc2Region();
        } catch {
          // Ignore errors - might not be running on EC2
        }
        
        const region = detectedRegion ?? env.AWS_REGION;
        
        res.json(
          settings ?? {
            name: null,
            awsRegion: region,
            awsAccessKeyId: null,
            hasAwsSecretAccessKey: false,
            updatedAt: null,
          },
        );
      } else {
        res.json(settings);
      }
    }),

    updateSettings: asyncHandler(async (req: Request<unknown, unknown, UpdateServerSettingsBody>, res: Response) => {
      const {
        name,
        awsRegion,
        awsAccessKeyId,
        awsSecretAccessKey,
        clearAwsSecretAccessKey,
      } = req.body;

      try {
        const updated = await service.updateSettings({
          name: name ?? null,
          awsRegion: awsRegion ?? null,
          awsAccessKeyId: awsAccessKeyId ?? null,
          awsSecretAccessKey,
          clearAwsSecretAccessKey: clearAwsSecretAccessKey ?? false,
        });

        res.json(updated);
      } catch (error) {
        if (error instanceof Error) {
          res.status(400).json({ message: error.message });
        } else {
          res.status(400).json({ message: 'Failed to update server settings.' });
        }
      }
    }),

    discoverSecurityGroups: asyncHandler(async (_req: Request, res: Response) => {
      const settings = await service.getInternal();
      const groups = await discoveryService.discoverSecurityGroups(settings);
      res.json({ items: groups });
    }),

    discoverNetworkAcls: asyncHandler(async (_req: Request, res: Response) => {
      const settings = await service.getInternal();
      const acls = await discoveryService.discoverNetworkAcls(settings);
      res.json({ items: acls });
    }),
  };
};

