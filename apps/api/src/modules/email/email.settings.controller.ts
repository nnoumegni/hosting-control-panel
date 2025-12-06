import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import type { EmailSettingsService } from './email.settings.service.js';
import type { EmailSettingsUpdateParams } from './email.settings.service.js';

export const createEmailSettingsController = (service: EmailSettingsService) => ({
  getSettings: asyncHandler(async (_req: Request, res: Response) => {
    const settings = await service.getSettings();
    res.json(settings);
  }),

  updateSettings: asyncHandler(async (req: Request<unknown, unknown, EmailSettingsUpdateParams>, res: Response) => {
    const { panicModeEnabled } = req.body;
    const settings = await service.updateSettings({ panicModeEnabled });
    res.json(settings);
  }),
});



