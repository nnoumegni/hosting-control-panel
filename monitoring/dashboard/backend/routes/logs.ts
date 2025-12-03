import { Router } from "express";
import { getLogs } from "../controllers/logsController";

const router = Router();
router.get("/", getLogs);
export default router;
