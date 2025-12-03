import { Request, Response } from "express";
import { logService } from "../services/logService";

export const getLogs = async (req: Request, res: Response) => {
  const logs = await logService.getRecentLogs(100);
  res.json(logs);
};
