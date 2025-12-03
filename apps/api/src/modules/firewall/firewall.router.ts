import { Router } from 'express';

import { validateRequest } from '../../shared/http/validate-request.js';
import type { FirewallService } from './firewall.service.js';
import { createFirewallController } from './firewall.controller.js';
import {
  createFirewallRuleValidation,
  firewallRuleParamsValidation,
  updateFirewallRuleValidation,
} from './firewall.schemas.js';
import type { FirewallSettingsService } from './firewall.settings.service.js';
import { createFirewallSettingsController } from './firewall.settings.controller.js';
import { updateFirewallSettingsValidation } from './firewall.settings.schemas.js';
import type { FirewallVerificationService } from './firewall.verification-service.js';
import type { FirewallAutoConfigService } from './firewall.auto-config.js';
import type { DDoSProtectionService } from './ddos-protection.service.js';
import { createDDoSProtectionController } from './ddos-protection.controller.js';

export const createFirewallRouter = (
  firewallService: FirewallService,
  settingsService: FirewallSettingsService,
  verificationService: FirewallVerificationService,
  autoConfigService: FirewallAutoConfigService,
  ddosProtectionService?: DDoSProtectionService,
) => {
  const router = Router();
  const controller = createFirewallController(firewallService);
  const settingsController = createFirewallSettingsController(settingsService);

  router.get('/rules', controller.listRules);
  router.get('/rules/:id', validateRequest(firewallRuleParamsValidation), controller.getRule);
  router.post('/rules', validateRequest(createFirewallRuleValidation), controller.createRule);
  router.patch('/rules/:id', validateRequest(updateFirewallRuleValidation), controller.updateRule);
  router.delete('/rules/:id', validateRequest(firewallRuleParamsValidation), controller.deleteRule);

  router.get('/settings', settingsController.getSettings);
  router.put('/settings', validateRequest(updateFirewallSettingsValidation), settingsController.updateSettings);

  // DDoS Protection endpoints
  if (ddosProtectionService) {
    const ddosController = createDDoSProtectionController(ddosProtectionService);
    router.get('/ddos-protection/status', ddosController.getStatus);
    router.post('/ddos-protection/enable', ddosController.enableProtection);
    router.post('/ddos-protection/disable', ddosController.disableProtection);
    router.delete('/ddos-protection', ddosController.deleteProtection);
  }

      // Verification endpoint
      router.post('/verify', async (_req, res) => {
        try {
          const result = await verificationService.verifyAllRules();
          res.json({
            success: true,
            verified: result.verified,
            updated: result.updated,
            errors: result.errors,
            errorMessages: result.errorMessages,
            totalRules: result.totalRules,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Verification failed',
            errorMessages: [error instanceof Error ? error.message : 'Verification failed'],
          });
        }
      });

      // Get current instance ID (if running on EC2)
      router.get('/current-instance', async (_req, res) => {
        try {
          const { getEc2InstanceId } = await import('../../shared/aws/ec2-instance-detection.js');
          const instanceId = await getEc2InstanceId();
          res.json({ instanceId });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to get current instance ID',
          });
        }
      });

      // List EC2 instances endpoint
      router.get('/instances', async (_req, res) => {
        try {
          const instances = await autoConfigService.listInstances();
          res.json({ items: instances });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to list EC2 instances',
          });
        }
      });

      // Auto-configure endpoint (triggers discovery and saves Security Group and Network ACL IDs)
      router.post('/auto-configure', async (req, res) => {
        try {
          const instanceId = (req.body as { instanceId?: string })?.instanceId;
          const result = await autoConfigService.autoConfigure(instanceId);
          res.json({
            success: true,
            securityGroupId: result.securityGroupId,
            networkAclId: result.networkAclId,
            instanceId: result.instanceId,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Auto-configuration failed',
          });
        }
      });

      // Get AWS rules endpoint (queries Security Group and Network ACL directly from AWS)
      router.get('/aws-rules', async (_req, res) => {
        try {
          const rules = await verificationService.getAwsRules();
          res.json({
            success: true,
            securityGroupRules: rules.securityGroupRules,
            networkAclRules: rules.networkAclRules,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to fetch AWS rules',
          });
        }
      });

      // Delete Network ACL entry endpoint
      router.delete('/aws-rules/network-acl/:ruleNumber', async (req, res) => {
        try {
          const ruleNumber = parseInt(req.params.ruleNumber, 10);
          const egress = req.query.egress === 'true';
          
          if (isNaN(ruleNumber)) {
            res.status(400).json({
              success: false,
              message: 'Invalid rule number',
            });
            return;
          }

          await verificationService.deleteNetworkAclEntry(ruleNumber, egress);
          res.json({
            success: true,
            message: 'Network ACL entry deleted successfully',
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to delete Network ACL entry',
          });
        }
      });

      // Instance action endpoints (start, stop, terminate)
      router.post('/instances/:instanceId/start', async (req, res) => {
        try {
          const { instanceId } = req.params;
          await autoConfigService.startInstance(instanceId);
          res.json({
            success: true,
            message: `Instance ${instanceId} start initiated successfully`,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to start instance',
          });
        }
      });

      router.post('/instances/:instanceId/stop', async (req, res) => {
        try {
          const { instanceId } = req.params;
          await autoConfigService.stopInstance(instanceId);
          res.json({
            success: true,
            message: `Instance ${instanceId} stop initiated successfully`,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to stop instance',
          });
        }
      });

      router.post('/instances/:instanceId/terminate', async (req, res) => {
        try {
          const { instanceId } = req.params;
          await autoConfigService.terminateInstance(instanceId);
          res.json({
            success: true,
            message: `Instance ${instanceId} termination initiated successfully`,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to terminate instance',
          });
        }
      });

      return router;
};

