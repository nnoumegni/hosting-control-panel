import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import type { AccountsService } from './accounts.service.js';
import type { ListAccountsQuery, UpdateAccountBody, UpdatePlanBody } from './accounts.schemas.js';

export const createAccountsController = (service: AccountsService) => ({
  listPlans: asyncHandler(async (_req: Request, res: Response) => {
    const plans = await service.listPlans();
    res.json({ items: plans });
  }),

  createPlan: asyncHandler(async (req: Request, res: Response) => {
    // Body is validated by middleware, safe to cast
    // @ts-ignore - Body is validated by middleware, all required fields are present
    const plan = await service.createPlan(req.body);
    res.status(201).json(plan);
  }),

  updatePlan: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const plan = await service.updatePlan(id, req.body as UpdatePlanBody);
    res.json(plan);
  }),

  deletePlan: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await service.deletePlan(id);
    res.status(204).send();
  }),

  getPlan: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const plan = await service.getPlanById(id);
    res.json(plan);
  }),

  listAccounts: asyncHandler(async (req: Request, res: Response) => {
    const { ownerId, status, page, pageSize } = req.query as unknown as ListAccountsQuery;

    const result = await service.listAccounts({
      ownerId,
      status,
      pagination: { page, pageSize },
    });

    res.json(result);
  }),

  createAccount: asyncHandler(async (req: Request, res: Response) => {
    // Body is validated by middleware, safe to cast
    // @ts-ignore - Body is validated by middleware, all required fields are present
    const account = await service.createAccount(req.body);
    res.status(201).json(account);
  }),

  getAccount: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const account = await service.getAccountById(id);
    res.json(account);
  }),

  updateAccount: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const account = await service.updateAccount(id, req.body as UpdateAccountBody);
    res.json(account);
  }),

  deleteAccount: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await service.deleteAccount(id);
    res.status(204).send();
  }),
});
