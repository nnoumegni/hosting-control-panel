import type { Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.js';
import type { EmailService } from './email.service.js';
import type { EmailSecurityService } from './email.security.service.js';

export const createEmailController = (
  service: EmailService,
  securityService?: EmailSecurityService,
) => ({
  listIdentities: asyncHandler(async (req: Request, res: Response) => {
    const overview = await service.listIdentities();
    const { domain } = req.query as { domain?: string };
    if (domain) {
      const d = String(domain).toLowerCase();
      const filtered = {
        ...overview,
        identities: overview.identities.filter((i) => i.domain.toLowerCase() === d),
        domains: overview.domains.filter((x) => x.toLowerCase() === d),
      };
      res.json(filtered);
      return;
    }
    res.json(overview);
  }),

  verifyEmail: asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };
    
    // Validate email format
    if (!email || typeof email !== 'string') {
      res.status(400).json({ message: 'Email address is required' });
      return;
    }
    
    const trimmedEmail = email.trim();
    if (trimmedEmail === '') {
      res.status(400).json({ message: 'Email address cannot be empty' });
      return;
    }
    
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      res.status(400).json({ message: 'Please enter a valid email address' });
      return;
    }
    
    // Additional validation checks
    if (trimmedEmail.includes('..') || trimmedEmail.startsWith('.') || trimmedEmail.startsWith('@')) {
      res.status(400).json({ message: 'Please enter a valid email address' });
      return;
    }
    
    await service.verifyEmailIdentity(trimmedEmail);
    res.json({ success: true, message: `Verification email sent to ${trimmedEmail}` });
  }),

  deleteIdentity: asyncHandler(async (req: Request, res: Response) => {
    const { identity } = req.params as { identity: string };
    await service.deleteIdentity(identity);
    res.json({ success: true, message: `Identity ${identity} deleted successfully` });
  }),

  getMonitoringData: asyncHandler(async (_req: Request, res: Response) => {
    const monitoringData = await service.getMonitoringData();
    
    // Enhance with real suppression stats if security service is available
    if (securityService) {
      try {
        const suppressionStats = await securityService.getSuppressionStats();
        monitoringData.suppression = {
          bounce: suppressionStats.bounce,
          complaint: suppressionStats.complaint,
        };
      } catch (error) {
        // If suppression stats fail, keep the estimated values
        console.error('Failed to get suppression stats', error);
      }
    }
    
    res.json(monitoringData);
  }),
});

