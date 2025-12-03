import { Router } from 'express';
import { validateRequest } from '../../shared/http/validate-request.js';
import type { AuthService } from './auth.service.js';
import { createAuthController } from './auth.controller.js';
import { loginSchema, refreshTokenSchema } from './auth.schemas.js';

export const createAuthRouter = (authService: AuthService) => {
  const router = Router();
  const controller = createAuthController(authService);

  router.post('/login', validateRequest({ body: loginSchema }), controller.login);
  router.post('/refresh', validateRequest({ body: refreshTokenSchema }), controller.refresh);
  router.post('/logout', controller.logout);

  return router;
};
