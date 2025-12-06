import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import type { EmailSecurityService } from './email.security.service.js';

export const createEmailSecurityController = (service: EmailSecurityService) => ({
  pauseAccountSending: asyncHandler(async (_req: Request, res: Response) => {
    const result = await service.pauseAccountSending();
    res.json(result);
  }),

  resumeAccountSending: asyncHandler(async (_req: Request, res: Response) => {
    const result = await service.resumeAccountSending();
    res.json(result);
  }),

  getAccountSendingStatus: asyncHandler(async (_req: Request, res: Response) => {
    const status = await service.getAccountSendingStatus();
    res.json(status);
  }),

  addToSuppressionList: asyncHandler(async (req: Request, res: Response) => {
    const { emailAddress, reason } = req.body as { emailAddress: string; reason: 'BOUNCE' | 'COMPLAINT' };
    
    if (!emailAddress || typeof emailAddress !== 'string') {
      res.status(400).json({ message: 'Email address is required' });
      return;
    }

    if (!reason || !['BOUNCE', 'COMPLAINT'].includes(reason)) {
      res.status(400).json({ message: 'Reason must be BOUNCE or COMPLAINT' });
      return;
    }

    const result = await service.addToSuppressionList(emailAddress, reason);
    res.json(result);
  }),

  removeFromSuppressionList: asyncHandler(async (req: Request, res: Response) => {
    const { emailAddress } = req.body as { emailAddress: string };
    
    if (!emailAddress || typeof emailAddress !== 'string') {
      res.status(400).json({ message: 'Email address is required' });
      return;
    }

    const result = await service.removeFromSuppressionList(emailAddress);
    res.json(result);
  }),

  getSuppressionList: asyncHandler(async (req: Request, res: Response) => {
    const { reason, nextToken, pageSize } = req.query as {
      reason?: 'BOUNCE' | 'COMPLAINT';
      nextToken?: string;
      pageSize?: string;
    };

    const result = await service.getSuppressionList(
      reason,
      nextToken,
      pageSize ? parseInt(pageSize, 10) : 100,
    );
    res.json(result);
  }),

  getSuppressionStats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await service.getSuppressionStats();
    res.json(stats);
  }),

  getSuppressedDestination: asyncHandler(async (req: Request, res: Response) => {
    const { emailAddress } = req.query as { emailAddress: string };
    
    if (!emailAddress) {
      res.status(400).json({ message: 'Email address is required' });
      return;
    }

    const destination = await service.getSuppressedDestination(emailAddress);
    if (!destination) {
      res.status(404).json({ message: 'Email address not found in suppression list' });
      return;
    }

    res.json(destination);
  }),

  blockIdentity: asyncHandler(async (req: Request, res: Response) => {
    const { identity } = req.body as { identity: string };
    
    if (!identity || typeof identity !== 'string') {
      res.status(400).json({ message: 'Identity is required' });
      return;
    }

    const result = await service.blockIdentity(identity);
    res.json(result);
  }),

  unblockIdentity: asyncHandler(async (req: Request, res: Response) => {
    const { identity } = req.body as { identity: string };
    
    if (!identity || typeof identity !== 'string') {
      res.status(400).json({ message: 'Identity is required' });
      return;
    }

    const result = await service.unblockIdentity(identity);
    res.json(result);
  }),

  getIdentityPolicies: asyncHandler(async (req: Request, res: Response) => {
    const { identity } = req.query as { identity: string };
    
    if (!identity) {
      res.status(400).json({ message: 'Identity is required' });
      return;
    }

    const policies = await service.getIdentityPolicies(identity);
    res.json({ policies });
  }),

  isIdentityBlocked: asyncHandler(async (req: Request, res: Response) => {
    const { identity } = req.query as { identity: string };
    
    if (!identity) {
      res.status(400).json({ message: 'Identity is required' });
      return;
    }

    const isBlocked = await service.isIdentityBlocked(identity);
    res.json({ identity, isBlocked });
  }),

  bulkAddToSuppressionList: asyncHandler(async (req: Request, res: Response) => {
    const { emailAddresses, reason } = req.body as {
      emailAddresses: string[];
      reason: 'BOUNCE' | 'COMPLAINT';
    };
    
    if (!emailAddresses || !Array.isArray(emailAddresses) || emailAddresses.length === 0) {
      res.status(400).json({ message: 'Email addresses array is required' });
      return;
    }

    if (!reason || !['BOUNCE', 'COMPLAINT'].includes(reason)) {
      res.status(400).json({ message: 'Reason must be BOUNCE or COMPLAINT' });
      return;
    }

    const result = await service.bulkAddToSuppressionList(emailAddresses, reason);
    res.json(result);
  }),

  enableAccountSuppression: asyncHandler(async (_req: Request, res: Response) => {
    const result = await service.enableAccountSuppression();
    res.json(result);
  }),
});



