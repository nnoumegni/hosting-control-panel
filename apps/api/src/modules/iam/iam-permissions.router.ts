import { Router } from 'express';
import { createIAMPermissionsController } from './iam-permissions.controller.js';
import type { IAMPermissionsService } from './iam-permissions.service.js';

export const createIAMPermissionsRouter = (service: IAMPermissionsService) => {
  const router = Router();
  const controller = createIAMPermissionsController(service);

  router.get('/permissions/check', controller.checkPermissions);
  router.get('/role/status', controller.checkRoleStatus);
  router.post('/permissions/grant', controller.grantPermissions);

  return router;
};

