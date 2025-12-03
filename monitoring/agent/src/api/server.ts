// agent/src/api/server.ts
import http from "http";
import { logger } from "../core/logger";
import { handleBlock } from "./handlers/block";
import { handleUnblock } from "./handlers/unblock";
import { handleConfig } from "./handlers/config";
import { handleState } from "./handlers/state";
import { handleTail } from "./handlers/tail";
import { handleRestart } from "./handlers/restart";
import { handleKill } from "./handlers/kill";
import { handlePing } from "./handlers/ping";

const TOKEN = process.env.AGENT_TOKEN || "";

export function startApiServer() {
  const server = http.createServer(async (req, res) => {
    // Only allow local traffic
    if (req.socket.remoteAddress !== "127.0.0.1") {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    // Auth
    if (req.headers["x-agent-token"] !== TOKEN) {
      res.writeHead(401);
      return res.end("Unauthorized");
    }

    // Routing
    if (req.url === "/block" && req.method === "POST") return handleBlock(req, res);
    if (req.url === "/unblock" && req.method === "POST") return handleUnblock(req, res);
    if (req.url === "/config" && req.method === "POST") return handleConfig(req, res);
    if (req.url === "/state" && req.method === "GET") return handleState(req, res);
    if (req.url === "/tail" && req.method === "POST") return handleTail(req, res);
    if (req.url === "/restart" && req.method === "POST") return handleRestart(req, res);
    if (req.url === "/kill" && req.method === "POST") return handleKill(req, res);
    if (req.url === "/ping" && req.method === "GET") return handlePing(req, res);

    // Default
    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(9876, "127.0.0.1", () => {
    logger.info("C2 API listening on 127.0.0.1:9876");
  });
}
