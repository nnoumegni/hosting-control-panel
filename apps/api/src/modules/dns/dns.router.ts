import { Router } from 'express';
import { validateRequest } from '../../shared/http/validate-request.js';
import type { DNSService } from './dns.service.js';
import { createDNSController } from './dns.controller.js';
import { dnsLookupQuerySchema, dnsDiagnosticsParamsSchema } from './dns.schemas.js';

export const createDNSRouter = (service: DNSService) => {
  const router = Router();
  const controller = createDNSController(service);

  router.get(
    '/lookup',
    validateRequest({ query: dnsLookupQuerySchema }),
    controller.lookup,
  );

  router.get(
    '/diagnostics',
    validateRequest({ query: dnsDiagnosticsParamsSchema }),
    controller.getDiagnostics,
  );

  return router;
};

