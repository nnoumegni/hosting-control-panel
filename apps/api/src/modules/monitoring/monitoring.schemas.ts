import { z } from 'zod';

export const heartbeatBodySchema = z.object({
  instanceId: z.string().min(1),
  version: z.string().min(1),
  metrics: z.object({
    cpuLoad: z.number(),
    memoryUsedPct: z.number(),
    uptime: z.number(),
    diskUsage: z.object({
      total: z.number(),
      used: z.number(),
      available: z.number(),
      percent: z.number(),
    }).optional(),
    networkStats: z.object({
      bytesIn: z.number(),
      bytesOut: z.number(),
      packetsIn: z.number(),
      packetsOut: z.number(),
    }).optional(),
  }),
  blockedIps: z.array(z.string()).optional(),
  status: z.enum(['online', 'offline']).optional(),
});

export const logEventBodySchema = z.object({
  instanceId: z.string().min(1),
  ip: z.string().min(1),
  path: z.string().min(1),
  status: z.number().int(),
  method: z.string().optional(),
  userAgent: z.string().optional(),
  raw: z.string().min(1),
});

export const createAgentConfigSchema = z.object({
  instanceId: z.string().min(1),
  dashboardUrl: z.string().url().optional(),
  logPaths: z.array(z.string()).optional(),
  tailFormat: z.enum(['apache-clf', 'nginx', 'nginx-json']).optional(),
  autoUpdate: z.boolean().optional(),
  heartbeatInterval: z.number().int().positive().optional(),
  requestThreshold: z.number().int().positive().optional(),
  blockDurationMinutes: z.number().int().positive().optional(),
});

export const updateAgentConfigSchema = z.object({
  dashboardUrl: z.string().url().optional(),
  logPaths: z.array(z.string()).optional(),
  tailFormat: z.enum(['apache-clf', 'nginx', 'nginx-json']).optional(),
  autoUpdate: z.boolean().optional(),
  heartbeatInterval: z.number().int().positive().optional(),
  requestThreshold: z.number().int().positive().optional(),
  blockDurationMinutes: z.number().int().positive().optional(),
});

export const instanceIdParamsSchema = z.object({
  instanceId: z.string().min(1),
});

export const getHeartbeatsQuerySchema = z.object({
  instanceId: z.string().min(1),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const getLogEventsQuerySchema = z.object({
  instanceId: z.string().min(1),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const getMetricsSummaryQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export type HeartbeatBody = z.infer<typeof heartbeatBodySchema>;
export type LogEventBody = z.infer<typeof logEventBodySchema>;
export type CreateAgentConfigBody = z.infer<typeof createAgentConfigSchema>;
export type UpdateAgentConfigBody = z.infer<typeof updateAgentConfigSchema>;
export type InstanceIdParams = z.infer<typeof instanceIdParamsSchema>;
export type GetHeartbeatsQuery = z.infer<typeof getHeartbeatsQuerySchema>;
export type GetLogEventsQuery = z.infer<typeof getLogEventsQuerySchema>;
export type GetMetricsSummaryQuery = z.infer<typeof getMetricsSummaryQuerySchema>;

