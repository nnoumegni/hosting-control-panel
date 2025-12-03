import { Router } from 'express';

import { createBillingController } from './billing.controller.js';
import type { BillingService } from './billing.service.js';

export const createBillingRouter = (service: BillingService) => {
  const router = Router();
  const controller = createBillingController(service);

  router.get('/overview', controller.getOverview);

  return router;
};

