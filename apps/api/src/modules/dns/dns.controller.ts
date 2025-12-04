import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { DNSService } from './dns.service.js';

export const createDNSController = (service: DNSService) => ({
  lookup: asyncHandler(async (req: Request, res: Response) => {
    const { hostname, type, instanceId } = req.query as {
      hostname: string;
      type?: string;
      instanceId?: string;
    };

    const result = await service.lookup(
      hostname,
      (type as any) || 'A',
      instanceId,
    );

    res.json(result);
  }),

  getDiagnostics: asyncHandler(async (req: Request, res: Response) => {
    const { hostname, instanceId } = req.query as { hostname: string; instanceId?: string };

    if (!hostname) {
      return res.status(400).json({ error: 'hostname parameter is required' });
    }

    const result = await service.getDiagnostics(hostname, instanceId);

    res.json(result);
  }),
});

