import { Router } from 'express';
import { validateRequest } from '../../shared/http/validate-request.js';
import type { MailProvidersService } from './mail-providers.service.js';
import { createMailProvidersController } from './mail-providers.controller.js';
import {
  detectProviderSchema,
  validateGoogleProviderSchema,
  validateMicrosoft365ProviderSchema,
  getDnsStatusSchema,
  listUsersSchema,
  deleteUserSchema,
  resetPasswordSchema,
} from './mail-providers.schemas.js';

export const createMailProvidersRouter = (service: MailProvidersService) => {
  const router = Router();
  const controller = createMailProvidersController(service);

  // Provider detection and configuration
  router.get('/domains/:domainId/detect', validateRequest(detectProviderSchema), controller.detectProvider);
  router.post(
    '/domains/:domainId/providers/google/validate',
    validateRequest(validateGoogleProviderSchema),
    controller.validateGoogleProvider,
  );
  router.post(
    '/domains/:domainId/providers/m365/validate',
    validateRequest(validateMicrosoft365ProviderSchema),
    controller.validateMicrosoft365Provider,
  );
  router.get('/domains/:domainId/provider', controller.getProvider);
  router.get('/domains/:domainId/dns/status', validateRequest(getDnsStatusSchema), controller.getDnsStatus);

  // User management
  router.get('/domains/:domainId/users', validateRequest(listUsersSchema), controller.listUsers);
  router.post('/domains/:domainId/users', controller.createUser); // Schema validation in controller based on provider
  router.patch('/domains/:domainId/users/:userId', controller.updateUser); // Schema validation in controller based on provider
  router.delete('/domains/:domainId/users/:userId', validateRequest(deleteUserSchema), controller.deleteUser);
  router.post(
    '/domains/:domainId/users/:userId/reset-password',
    validateRequest(resetPasswordSchema),
    controller.resetPassword,
  );

  return router;
};

