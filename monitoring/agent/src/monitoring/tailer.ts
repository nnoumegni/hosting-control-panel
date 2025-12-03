// agent/src/monitoring/tailer.ts
import fs from "fs";
import { logger } from "../core/logger";
import { parseLogLine } from "./parser";

export type TailEvent = {
  ip: string;
  path: string;
  status: number;
  ua?: string;
  raw: string;
};

type Callback = (event: TailEvent) => void;

export class LogTailer {
  private watchers: fs.FSWatcher[] = [];
  private callbacks: Callback[] = [];
  private buffers: Record<string, string> = {};

  constructor(private files: string[]) {}

  onLine(cb: Callback) {
    this.callbacks.push(cb);
  }

  start() {
    for (const file of this.files) {
      if (!fs.existsSync(file)) continue;

      logger.info("Tailing log file", file);
      this.buffers[file] = "";

      const watcher = fs.watch(file, { encoding: "utf-8" }, () => {
        this.processFile(file);
      });

      this.watchers.push(watcher);
      this.processFile(file); // initial read
    }
  }

  stop() {
    this.watchers.forEach(w => w.close());
    logger.info("Stopped tailing logs.");
  }

  private processFile(file: string) {
    fs.readFile(file, "utf8", (err, data) => {
      if (err) return;

      let buffer = this.buffers[file] + data;

      const lines = buffer.split("\n");
      this.buffers[file] = lines.pop() || ""; // last partial line buffer

      for (const line of lines) {
        const parsed = parseLogLine(line);
        if (!parsed) continue;

        const event: TailEvent = {
          ...parsed,
          raw: line,
        };

        for (const cb of this.callbacks) cb(event);
      }
    });
  }
}
