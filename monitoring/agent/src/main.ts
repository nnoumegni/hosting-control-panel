// agent/src/main.ts (snippet)
import { unblockExpiredIps } from "./security/blocker";

setInterval(() => {
  unblockExpiredIps();
}, 30_000);
