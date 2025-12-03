import { Router } from 'express';
import { createDatabasesController } from './databases.controller.js';
import type { DatabasesService } from './databases.service.js';

export const createDatabasesRouter = (service: DatabasesService) => {
  const router = Router();
  const controller = createDatabasesController(service);

  router.get('/', controller.list);
  router.post('/', controller.purchase);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.get('/:id/credentials', controller.getCredentials);
  router.post('/:id/reset-password', controller.resetPassword);

  return router;
};


