import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { DDoSProtectionService } from './ddos-protection.service.js';

export const createDDoSProtectionController = (service: DDoSProtectionService) => ({
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    
    if (!instanceId) {
      res.status(400).json({ message: 'Instance ID is required' });
      return;
    }

    const status = await service.getStatus(instanceId);
    
    if (!status) {
      res.status(404).json({ message: 'DDoS protection not configured for this instance' });
      return;
    }

    res.json({ status });
  }),

  enableProtection: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId, securityGroupId, logGroupName, requestThreshold, blockDurationMinutes } = req.body as {
      instanceId: string;
      securityGroupId: string;
      logGroupName?: string;
      requestThreshold?: number;
      blockDurationMinutes?: number;
    };

    if (!instanceId || !securityGroupId) {
      res.status(400).json({ message: 'Instance ID and Security Group ID are required' });
      return;
    }

    try {
      const status = await service.enableProtection({
        instanceId,
        securityGroupId,
        logGroupName,
        requestThreshold,
        blockDurationMinutes,
      });

      res.status(201).json({ status, message: 'DDoS protection enabled successfully' });
    } catch (error: any) {
      // Log the actual error for debugging
      console.error('DDoS protection enable error:', error);
      
      // Re-throw to let the error handler process it
      throw error;
    }
  }),

  disableProtection: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };

    if (!instanceId) {
      res.status(400).json({ message: 'Instance ID is required' });
      return;
    }

    await service.disableProtection(instanceId);

    res.json({ message: 'DDoS protection disabled successfully' });
  }),

  deleteProtection: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };

    if (!instanceId) {
      res.status(400).json({ message: 'Instance ID is required' });
      return;
    }

    await service.deleteProtection(instanceId);

    res.json({ message: 'DDoS protection resources deleted successfully' });
  }),
});

