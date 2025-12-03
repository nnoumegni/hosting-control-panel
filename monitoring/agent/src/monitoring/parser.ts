// agent/src/monitoring/parser.ts
import { logger } from "../core/logger";

export interface ParsedLog {
  ip: string;
  path: string;
  status: number;
  ua?: string;
}

const apacheRegex =
  /^(\S+) \S+ \S+ \[[^\]]+\] "GET ([^"]+) HTTP\/[0-9.]+" (\d+)/;

const nginxRegex =
  /^(\S+) - \S+ \[[^\]]+\] "GET ([^"]+) HTTP\/[0-9.]+" (\d+)/;

export function parseLogLine(line: string): ParsedLog | null {
  if (!line || line.length < 5) return null;

  // NGINX JSON
  if (line.trim().startsWith("{")) {
    try {
      const json = JSON.parse(line);
      return {
        ip: json.remote_addr,
        path: json.request?.split(" ")[1],
        status: json.status,
        ua: json.http_user_agent,
      };
    } catch {
      return null;
    }
  }

  // Apache CLF
  let m = line.match(apacheRegex);
  if (m)
    return {
      ip: m[1],
      path: m[2],
      status: parseInt(m[3]),
    };

  // Nginx plaintext
  m = line.match(nginxRegex);
  if (m)
    return {
      ip: m[1],
      path: m[2],
      status: parseInt(m[3]),
    };

  return null;
}
