import { Router } from 'express';
import { createSecurityAnalyticsController } from './security-analytics.controller.js';
import type { SecurityAnalyticsService } from './security-analytics.service.js';

export const createSecurityAnalyticsRouter = (
  service: SecurityAnalyticsService,
) => {
  const router = Router();
  const controller = createSecurityAnalyticsController(service);

  // Dashboard endpoints
  router.get('/dashboard/summary', controller.getDashboardSummary);
  router.get('/dashboard/timeseries', controller.getTimeSeries);
  router.get('/dashboard/threat-categories', controller.getThreatCategories);
  router.get('/dashboard/all', controller.getAllDashboardData);

  // Summary/Log endpoints
  router.get('/summary', controller.getSummary);

  // Adaptive Blocking endpoints
  router.get('/reputation/ip', controller.getIPReputation);
  router.get('/reputation/cidr', controller.getCIDROffenders);
  router.get('/reputation/asn', controller.getASNReputation);
  router.get('/blocks/events', controller.getBlockEvents);

  return router;
};

