import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import type { SecurityAnalyticsService } from './security-analytics.service.js';
import { BadRequestError } from '../../shared/errors.js';

export const createSecurityAnalyticsController = (
  service: SecurityAnalyticsService,
) => ({
  getDashboardSummary: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;

    if (isNaN(days) || days < 0) {
      throw new BadRequestError('days must be a non-negative integer');
    }

    const data = await service.getDashboardSummary(instanceId, days);
    res.json(data);
  }),

  getTimeSeries: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const interval = (req.query.interval as 'hour' | 'day') || 'hour';
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 1;

    if (!['hour', 'day'].includes(interval)) {
      throw new BadRequestError('interval must be "hour" or "day"');
    }

    if (isNaN(days) || days < 0) {
      throw new BadRequestError('days must be a non-negative integer');
    }

    const data = await service.getTimeSeries(instanceId, interval, days);
    res.json(data);
  }),

  getThreatCategories: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;

    if (isNaN(days) || days < 0) {
      throw new BadRequestError('days must be a non-negative integer');
    }

    const data = await service.getThreatCategories(instanceId, days);
    res.json(data);
  }),

  getSummary: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const query = req.query.q as string | undefined;
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const groupBy = req.query.groupBy as 'cidr' | 'country' | 'city' | 'region' | 'platform' | undefined;
    const cidrMask = req.query.cidrMask ? parseInt(req.query.cidrMask as string, 10) : undefined;
    const minThreatScore = req.query.minThreatScore ? parseInt(req.query.minThreatScore as string, 10) : undefined;
    const threatLevel = req.query.threatLevel as 'low' | 'medium' | 'high' | 'critical' | undefined;

    if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 1000)) {
      throw new BadRequestError('limit must be between 1 and 1000');
    }

    if (offset !== undefined && (isNaN(offset) || offset < 0)) {
      throw new BadRequestError('offset must be a non-negative integer');
    }

    if (days !== undefined && (isNaN(days) || days < 0)) {
      throw new BadRequestError('days must be a non-negative integer');
    }

    if (groupBy && !['cidr', 'country', 'city', 'region', 'platform'].includes(groupBy)) {
      throw new BadRequestError('groupBy must be one of: cidr, country, city, region, platform');
    }

    if (cidrMask !== undefined && ![8, 16, 24, 32].includes(cidrMask)) {
      throw new BadRequestError('cidrMask must be 8, 16, 24, or 32');
    }

    if (minThreatScore !== undefined && (isNaN(minThreatScore) || minThreatScore < 0 || minThreatScore > 100)) {
      throw new BadRequestError('minThreatScore must be between 0 and 100');
    }

    if (threatLevel && !['low', 'medium', 'high', 'critical'].includes(threatLevel)) {
      throw new BadRequestError('threatLevel must be one of: low, medium, high, critical');
    }

    const data = await service.getSummary(instanceId, {
      limit,
      offset,
      query,
      days,
      groupBy,
      cidrMask,
      minThreatScore,
      threatLevel,
    });
    res.json(data);
  }),

  getAllDashboardData: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;

    if (isNaN(days) || days < 0) {
      throw new BadRequestError('days must be a non-negative integer');
    }

    const data = await service.getAllDashboardData(instanceId, days);
    res.json(data);
  }),

  getIPReputation: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestError('limit must be between 1 and 1000');
    }

    const data = await service.getIPReputation(instanceId, limit);
    res.json(data);
  }),

  getCIDROffenders: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const mask = req.query.mask ? parseInt(req.query.mask as string, 10) : 24;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    if (![8, 16, 24, 32].includes(mask)) {
      throw new BadRequestError('mask must be 8, 16, 24, or 32');
    }

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestError('limit must be between 1 and 1000');
    }

    const data = await service.getCIDROffenders(instanceId, mask, limit);
    res.json(data);
  }),

  getASNReputation: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestError('limit must be between 1 and 1000');
    }

    const data = await service.getASNReputation(instanceId, limit);
    res.json(data);
  }),

  getBlockEvents: asyncHandler(async (req: Request, res: Response) => {
    const { instanceId } = req.query as { instanceId?: string };
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;

    if (isNaN(days) || days < 0) {
      throw new BadRequestError('days must be a non-negative integer');
    }

    const data = await service.getBlockEvents(instanceId, days);
    res.json(data);
  }),
});

