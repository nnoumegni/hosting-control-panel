import { Router } from 'express';

import { validateRequest } from '../../shared/http/validate-request.js';
import { createServerSettingsController } from './server-settings.controller.js';
import { getServerSettingsValidation, updateServerSettingsValidation } from './server-settings.schemas.js';
import type { ServerSettingsService } from './server-settings.service.js';

export const createServerSettingsRouter = (service: ServerSettingsService) => {
  const router = Router();
  const controller = createServerSettingsController(service);

  router.get('/', validateRequest(getServerSettingsValidation), controller.getSettings);
  router.put('/', validateRequest(updateServerSettingsValidation), controller.updateSettings);
  router.get('/discover/security-groups', controller.discoverSecurityGroups);
  router.get('/discover/network-acls', controller.discoverNetworkAcls);

  return router;
};

