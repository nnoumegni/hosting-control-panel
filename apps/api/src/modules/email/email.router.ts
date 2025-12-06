import { Router } from 'express';

import { createEmailController } from './email.controller.js';
import type { EmailService } from './email.service.js';
import { createEmailSettingsController } from './email.settings.controller.js';
import type { EmailSettingsService } from './email.settings.service.js';
import { createEmailSecurityController } from './email.security.controller.js';
import type { EmailSecurityService } from './email.security.service.js';

export const createEmailRouter = (
  service: EmailService,
  settingsService: EmailSettingsService,
  securityService: EmailSecurityService,
) => {
  const router = Router();
  const controller = createEmailController(service, securityService);
  const settingsController = createEmailSettingsController(settingsService);
  const securityController = createEmailSecurityController(securityService);

  router.get('/identities', controller.listIdentities);
  router.post('/identities/verify', controller.verifyEmail);
  router.delete('/identities/:identity', controller.deleteIdentity);

  // Monitoring endpoint
  router.get('/monitoring', controller.getMonitoringData);

  // Settings endpoints
  router.get('/settings', settingsController.getSettings);
  router.put('/settings', settingsController.updateSettings);

  // Security endpoints
  router.post('/security/pause-sending', securityController.pauseAccountSending);
  router.post('/security/resume-sending', securityController.resumeAccountSending);
  router.get('/security/sending-status', securityController.getAccountSendingStatus);
  
  // Suppression list management
  router.post('/security/suppression/add', securityController.addToSuppressionList);
  router.post('/security/suppression/remove', securityController.removeFromSuppressionList);
  router.get('/security/suppression/list', securityController.getSuppressionList);
  router.get('/security/suppression/stats', securityController.getSuppressionStats);
  router.get('/security/suppression/check', securityController.getSuppressedDestination);
  router.post('/security/suppression/bulk-add', securityController.bulkAddToSuppressionList);
  router.post('/security/suppression/enable-account', securityController.enableAccountSuppression);
  
  // Identity blocking
  router.post('/security/identity/block', securityController.blockIdentity);
  router.post('/security/identity/unblock', securityController.unblockIdentity);
  router.get('/security/identity/policies', securityController.getIdentityPolicies);
  router.get('/security/identity/blocked', securityController.isIdentityBlocked);

  return router;
};

