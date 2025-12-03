import fs from "fs";
import path from "path";

const LOG_FILE = "/var/log/nginx/access.log"; // Agent reads this

export const logService = {
  getRecentLogs(limit: number) {
    const data = fs.readFileSync(LOG_FILE, "utf-8").split("\n").reverse();
    return data.slice(0, limit);
  }
};
