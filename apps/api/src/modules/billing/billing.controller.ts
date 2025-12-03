import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import type { BillingService } from './billing.service.js';

export const createBillingController = (service: BillingService) => ({
  getOverview: asyncHandler(async (_req: Request, res: Response) => {
    const overview = await service.getBillingOverview();
    res.json(overview);
  }),
});

