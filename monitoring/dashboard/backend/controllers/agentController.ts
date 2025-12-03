import { Request, Response } from "express";
import { agentService } from "../services/agentService";
import { ssmAgentService } from "../index.js";

// Legacy endpoint - keep for backward compatibility
export const getStatus = async (req: Request, res: Response) => {
  try {
    const status = await agentService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: "Failed to get agent status" });
  }
};

// New endpoint - check agent status on an instance via SSM
export const getAgentStatus = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      return res.status(400).json({ error: "instanceId query parameter is required" });
    }

    console.log(`[getAgentStatus] Checking status for instance: ${instanceId}`);
    const status = await ssmAgentService.checkAgentStatus(instanceId);
    console.log(`[getAgentStatus] Status result:`, status);
    res.json(status);
  } catch (err: any) {
    console.error("[getAgentStatus] Failed to get agent status:", err);
    const errorMessage = err?.message || String(err) || "Failed to get agent status";
    res.status(500).json({ error: errorMessage });
  }
};

// Install agent on an instance
export const installAgent = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;
    if (!instanceId || typeof instanceId !== 'string') {
      return res.status(400).json({ error: "instanceId is required in request body" });
    }

    const result = await ssmAgentService.installAgent(instanceId);
    res.json(result);
  } catch (err: any) {
    console.error("Failed to install agent:", err);
    res.status(500).json({ error: err.message || "Failed to install agent" });
  }
};

// Uninstall agent from an instance
export const uninstallAgent = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;
    if (!instanceId || typeof instanceId !== 'string') {
      return res.status(400).json({ error: "instanceId is required in request body" });
    }

    const result = await ssmAgentService.uninstallAgent(instanceId);
    res.json(result);
  } catch (err: any) {
    console.error("Failed to uninstall agent:", err);
    res.status(500).json({ error: err.message || "Failed to uninstall agent" });
  }
};

// Check command status
export const checkCommandStatus = async (req: Request, res: Response) => {
  try {
    const { commandId, instanceId } = req.query;
    if (!commandId || typeof commandId !== 'string') {
      return res.status(400).json({ error: "commandId query parameter is required" });
    }
    if (!instanceId || typeof instanceId !== 'string') {
      return res.status(400).json({ error: "instanceId query parameter is required" });
    }

    const status = await ssmAgentService.checkCommandStatus(commandId, instanceId);
    res.json(status);
  } catch (err: any) {
    console.error("Failed to check command status:", err);
    res.status(500).json({ error: err.message || "Failed to check command status" });
  }
};

// Test connectivity and diagnose issues
export const testConnectivity = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      return res.status(400).json({ error: "instanceId query parameter is required" });
    }

    const result = await ssmAgentService.testConnectivity(instanceId);
    res.json(result);
  } catch (err: any) {
    console.error("Failed to test connectivity:", err);
    res.status(500).json({ error: err.message || "Failed to test connectivity" });
  }
};

// Fetch live data from agent
export const getAgentData = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.query;
    const endpoint = (req.query.endpoint as string) || '/live';
    
    if (!instanceId || typeof instanceId !== 'string') {
      return res.status(400).json({ error: "instanceId query parameter is required" });
    }

    const data = await ssmAgentService.fetchAgentData(instanceId, endpoint);
    res.json(data);
  } catch (err: any) {
    console.error("Failed to fetch agent data:", err);
    res.status(500).json({ error: err.message || "Failed to fetch agent data" });
  }
};

// Legacy endpoints - keep for backward compatibility
export const updateConfig = async (req: Request, res: Response) => {
  try {
    await agentService.updateConfig(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update config" });
  }
};

export const triggerUpdate = async (req: Request, res: Response) => {
  try {
    await agentService.selfUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
};
