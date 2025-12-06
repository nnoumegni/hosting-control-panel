import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { IAMPermissionsService } from './iam-permissions.service.js';

export const createIAMPermissionsController = (service: IAMPermissionsService) => ({
  checkPermissions: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = (req.query.instanceId as string) || null;
    const permissions = await service.checkPermissions(instanceId);
    res.json({ permissions });
  }),

  checkRoleStatus: asyncHandler(async (req: Request, res: Response) => {
    const instanceId = (req.query.instanceId as string) || null;
    const status = await service.checkRoleStatus(instanceId);
    res.json(status);
  }),

  grantPermissions: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.body as { instanceId: string | null };
    const result = await service.grantPermissions(instanceId);
    res.json(result);
  }),
});

