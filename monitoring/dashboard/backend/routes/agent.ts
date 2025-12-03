import { Router } from "express";
import {
  getStatus,
  getAgentStatus,
  installAgent,
  uninstallAgent,
  checkCommandStatus,
  getAgentData,
  testConnectivity,
  updateConfig,
  triggerUpdate,
} from "../controllers/agentController";

const router = Router();

// Legacy endpoints
router.get("/status", getStatus);          // Agent status + blocked IPs (local)
router.post("/config", updateConfig);      // Update thresholds, rules
router.post("/update", triggerUpdate);     // Trigger auto-update

// New SSM-based endpoints
router.get("/ssm/status", getAgentStatus);           // Check agent status on instance via SSM
router.post("/ssm/install", installAgent);            // Install agent on instance
router.post("/ssm/uninstall", uninstallAgent);       // Uninstall agent from instance
router.get("/ssm/command", checkCommandStatus);       // Check SSM command status
router.get("/ssm/data", getAgentData);                // Fetch live data from agent
router.get("/ssm/test", testConnectivity);            // Test connectivity and diagnose issues

export default router;
