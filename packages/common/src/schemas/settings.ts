import { z } from 'zod';

import { ServerSettings } from '../types/settings.js';

export const serverSettingsSchema: z.ZodType<ServerSettings> = z.object({
  name: z.string().trim().min(1).nullable(),
  awsRegion: z.string().trim().min(1).nullable(),
  awsAccessKeyId: z.string().trim().min(1).nullable(),
  hasAwsSecretAccessKey: z.boolean(),
  updatedAt: z.string().nullable(),
});

export const updateServerSettingsSchema = z.object({
  name: z.string().trim().min(1).nullable().optional(),
  awsRegion: z.string().trim().min(1).nullable().optional(),
  awsAccessKeyId: z.string().trim().min(1).nullable().optional(),
  awsSecretAccessKey: z.string().trim().min(1).optional(),
  clearAwsSecretAccessKey: z.boolean().optional(),
});

export type ServerSettingsSchema = z.infer<typeof serverSettingsSchema>;
export type UpdateServerSettingsSchema = z.infer<typeof updateServerSettingsSchema>;

