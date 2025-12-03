import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { AuthService } from './auth.service.js';

export const createAuthController = (authService: AuthService) => ({
  login: asyncHandler(async (req: Request, res: Response) => {
    const { username, password, mfaToken } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent') ?? undefined;
    const result = await authService.login({ username, password, mfaToken, ipAddress, userAgent });
    res.status(200).json(result);
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken: token } = req.body;
    const result = await authService.refreshToken({ refreshToken: token });
    res.status(200).json(result);
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const token = (req.body.refreshToken as string | undefined) ?? req.headers.authorization;
    await authService.logout(token);
    res.status(204).send();
  }),
});
