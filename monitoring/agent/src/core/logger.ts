// agent/src/core/logger.ts
import fs from "fs";
import path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  private logFile: string;
  private level: LogLevel = "info";
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(logDir = "/var/log/jetcamer-agent") {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    this.logFile = path.join(logDir, "agent.log");
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private write(level: LogLevel, msg: string, data?: any) {
    if (this.levels[level] < this.levels[this.level]) return;

    const line =
      `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}` +
      (data ? ` ${JSON.stringify(data)}` : "");

    fs.appendFileSync(this.logFile, line + "\n");
    console.log(line);
  }

  debug(msg: string, data?: any) { this.write("debug", msg, data); }
  info(msg: string, data?: any) { this.write("info", msg, data); }
  warn(msg: string, data?: any) { this.write("warn", msg, data); }
  error(msg: string, data?: any) { this.write("error", msg, data); }
}

export const logger = new Logger();
