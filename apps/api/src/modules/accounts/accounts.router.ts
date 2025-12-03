import { Router } from 'express';

import { validateRequest } from '../../shared/http/validate-request.js';
import type { AccountsService } from './accounts.service.js';
import { createAccountsController } from './accounts.controller.js';
import {
  accountParamsValidation,
  createAccountValidation,
  createPlanValidation,
  listAccountsValidation,
  planParamsValidation,
  updateAccountValidation,
  updatePlanValidation,
} from './accounts.schemas.js';

export const createAccountsRouter = (service: AccountsService) => {
  const router = Router();
  const controller = createAccountsController(service);

  router.get('/plans', controller.listPlans);
  router.post('/plans', validateRequest(createPlanValidation), controller.createPlan);
  router.get('/plans/:id', validateRequest(planParamsValidation), controller.getPlan);
  router.patch('/plans/:id', validateRequest(updatePlanValidation), controller.updatePlan);
  router.delete('/plans/:id', validateRequest(planParamsValidation), controller.deletePlan);

  router.get('/', validateRequest(listAccountsValidation), controller.listAccounts);
  router.post('/', validateRequest(createAccountValidation), controller.createAccount);
  router.get('/:id', validateRequest(accountParamsValidation), controller.getAccount);
  router.patch('/:id', validateRequest(updateAccountValidation), controller.updateAccount);
  router.delete('/:id', validateRequest(accountParamsValidation), controller.deleteAccount);

  return router;
};
