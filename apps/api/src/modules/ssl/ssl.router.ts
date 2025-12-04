import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../shared/http/validate-request.js';
import type { SSLService } from './ssl.service.js';
import { createSSLController } from './ssl.controller.js';
import {
  issueCertificateBodySchema,
  renewCertificateBodySchema,
  revokeCertificateBodySchema,
  configureACMEAccountBodySchema,
  checkDomainQuerySchema,
  downloadCertificateQuerySchema,
} from './ssl.schemas.js';

export const createSSLRouter = (service: SSLService) => {
  const router = Router();
  const controller = createSSLController(service);

  // List certificates (with optional domain filter)
  router.get(
    '/',
    validateRequest({ query: z.object({ instanceId: z.string().optional(), domain: z.string().optional() }).passthrough() }),
    controller.listCertificates,
  );

  // Get certificate health
  router.get(
    '/health',
    validateRequest({ query: z.object({ instanceId: z.string().optional(), domain: z.string().optional() }).passthrough() }),
    controller.getCertificateHealth,
  );

  // Issue certificate
  router.post(
    '/issue',
    validateRequest({ 
      query: z.object({ instanceId: z.string().optional() }).passthrough(),
      body: issueCertificateBodySchema,
    }),
    controller.issueCertificate,
  );

  // Renew certificate
  router.post(
    '/renew',
    validateRequest({ 
      query: z.object({ instanceId: z.string().optional() }).passthrough(),
      body: renewCertificateBodySchema,
    }),
    controller.renewCertificate,
  );

  // Revoke certificate
  router.delete(
    '/revoke',
    validateRequest({ 
      query: z.object({ instanceId: z.string().optional() }).passthrough(),
      body: revokeCertificateBodySchema,
    }),
    controller.revokeCertificate,
  );

  // Get ACME account
  router.get(
    '/acme-account',
    validateRequest({ query: z.object({ instanceId: z.string().optional() }).passthrough() }),
    controller.getACMEAccount,
  );

  // Configure ACME account
  router.post(
    '/acme-account',
    validateRequest({ 
      query: z.object({ instanceId: z.string().optional() }).passthrough(),
      body: configureACMEAccountBodySchema,
    }),
    controller.configureACMEAccount,
  );

  // Check domain DNS
  router.get(
    '/check-domain',
    validateRequest({ 
      query: checkDomainQuerySchema.extend({ instanceId: z.string().optional() }),
    }),
    controller.checkDomain,
  );

  // Download certificate
  router.get(
    '/download',
    validateRequest({ 
      query: downloadCertificateQuerySchema.extend({ instanceId: z.string().optional() }),
    }),
    controller.downloadCertificate,
  );

  // Get auto-renewal status
  router.get(
    '/auto-renewal/status',
    validateRequest({ query: z.object({ instanceId: z.string().optional() }).passthrough() }),
    controller.getAutoRenewalStatus,
  );

  // Trigger auto-renewal check
  router.post(
    '/auto-renewal/trigger',
    validateRequest({ query: z.object({ instanceId: z.string().optional() }).passthrough() }),
    controller.triggerAutoRenewal,
  );

  return router;
};

