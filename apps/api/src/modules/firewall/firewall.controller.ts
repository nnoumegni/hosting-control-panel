import type { Request, Response } from 'express';

import { logger } from '../../core/logger/index.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { FirewallService } from './firewall.service.js';
import type {
  CreateFirewallRuleBody,
  FirewallRuleParams,
  UpdateFirewallRuleBody,
} from './firewall.schemas.js';

export const createFirewallController = (service: FirewallService) => ({
  listRules: asyncHandler(async (_req: Request, res: Response) => {
    try {
      const rules = await service.listRules();
      res.json({ items: rules });
    } catch (error) {
      logger.error({ err: error }, 'Failed to list firewall rules');
      throw error;
    }
  }),

  getRule: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as FirewallRuleParams;
    const rule = await service.getRule(id);
    res.json(rule);
  }),

  createRule: asyncHandler(async (req: Request, res: Response) => {
    const rule = await service.createRule(req.body as CreateFirewallRuleBody);
    res.status(201).json(rule);
  }),

  updateRule: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as FirewallRuleParams;
    const rule = await service.updateRule(id, req.body as UpdateFirewallRuleBody);
    res.json(rule);
  }),

  deleteRule: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as FirewallRuleParams;
    await service.deleteRule(id);
    res.status(204).send();
  }),
});

