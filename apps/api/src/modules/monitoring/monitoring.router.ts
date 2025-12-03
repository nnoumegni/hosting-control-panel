import { Router } from 'express';
import { validateRequest } from '../../shared/http/validate-request.js';
import type { MonitoringService } from './monitoring.service.js';
import type { SSMAgentService } from './ssm-agent.service.js';
import type { S3DataService } from './s3-data.service.js';
import { createMonitoringController } from './monitoring.controller.js';
import { createSSMAgentController } from './ssm-agent.controller.js';
import {
  heartbeatBodySchema,
  logEventBodySchema,
  createAgentConfigSchema,
  updateAgentConfigSchema,
  instanceIdParamsSchema,
  getHeartbeatsQuerySchema,
  getLogEventsQuerySchema,
  getMetricsSummaryQuerySchema,
} from './monitoring.schemas.js';

export const createMonitoringRouter = (service: MonitoringService, ssmAgentService: SSMAgentService, s3DataService: S3DataService) => {
  const router = Router();
  const controller = createMonitoringController(service, ssmAgentService, s3DataService);
  const ssmController = createSSMAgentController(ssmAgentService);

  // Heartbeat routes (push-based - for future use)
  router.post('/agents/heartbeat', validateRequest({ body: heartbeatBodySchema }), controller.heartbeat);
  
  // Pull-based monitoring routes (primary method)
  router.get('/agents/:instanceId/pull', validateRequest({ params: instanceIdParamsSchema }), controller.pullAgentStatus);
  router.get('/agents/:instanceId/heartbeat', validateRequest({ params: instanceIdParamsSchema }), controller.getLatestHeartbeat);
  router.get('/agents/heartbeats', validateRequest({ query: getHeartbeatsQuerySchema }), controller.getHeartbeats);
  router.get('/agents/online', controller.getOnlineAgents);

  // Log event routes
  router.post('/agents/logs', validateRequest({ body: logEventBodySchema }), controller.saveLogEvent);
  router.get('/agents/logs', validateRequest({ query: getLogEventsQuerySchema }), controller.getLogEvents);
  router.get('/agents/logs/ip/:ip', controller.getLogEventsByIp);

  // Agent config routes
  router.get('/agents/:instanceId/config', validateRequest({ params: instanceIdParamsSchema }), controller.getAgentConfig);
  router.post('/agents/config', validateRequest({ body: createAgentConfigSchema }), controller.createAgentConfig);
  router.patch('/agents/:instanceId/config', validateRequest({ params: instanceIdParamsSchema, body: updateAgentConfigSchema }), controller.updateAgentConfig);
  router.delete('/agents/:instanceId/config', validateRequest({ params: instanceIdParamsSchema }), controller.deleteAgentConfig);

  // Agent deployment routes
  router.post('/agents/:instanceId/deploy', validateRequest({ params: instanceIdParamsSchema }), controller.deployAgent);
  router.get('/agents/:instanceId/deploy/:commandId', controller.checkDeploymentStatus);
  router.post('/agents/:instanceId/start', validateRequest({ params: instanceIdParamsSchema }), controller.startMonitoring);
  router.post('/agents/:instanceId/stop', validateRequest({ params: instanceIdParamsSchema }), controller.stopMonitoring);
  router.post('/agents/:instanceId/uninstall', validateRequest({ params: instanceIdParamsSchema }), controller.uninstallAgent);

  // Metrics routes
  router.get('/agents/:instanceId/metrics', validateRequest({ params: instanceIdParamsSchema, query: getMetricsSummaryQuerySchema }), controller.getMetricsSummary);

  // Test routes
  router.get('/agents/:instanceId/test-log', controller.testLogFileAccess);

  // Analytics route - uses SSM agent service directly
  router.get('/analytics', controller.getAnalytics);

  // System metrics route - fetches system info and top processes from agent
  router.get('/system', controller.getSystemMetrics);

  // SSM agent routes (consolidated from monitoring dashboard backend)
  router.get('/agent/ssm/status', ssmController.getAgentStatus);
  router.post('/agent/ssm/install', ssmController.installAgent);
  router.post('/agent/ssm/uninstall', ssmController.uninstallAgent);
  router.get('/agent/ssm/command', ssmController.checkCommandStatus);
  router.get('/agent/ssm/data', ssmController.getAgentData);
  router.get('/agent/ssm/test', ssmController.testConnectivity);
  router.get('/agent/ssm/machine-id', ssmController.getMachineId);
  router.put('/agent/ssm/aws-config', ssmController.setAwsConfig);
  router.get('/agent/ssm/s3-validate', ssmController.validateS3Config);

  return router;
};

