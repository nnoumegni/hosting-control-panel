import { Router } from 'express';

import { createEmailController } from './email.controller.js';
import type { EmailService } from './email.service.js';

export const createEmailRouter = (service: EmailService) => {
  const router = Router();
  const controller = createEmailController(service);

  router.get('/identities', controller.listIdentities);
  router.post('/identities/verify', controller.verifyEmail);
  router.delete('/identities/:identity', controller.deleteIdentity);

  return router;
};

