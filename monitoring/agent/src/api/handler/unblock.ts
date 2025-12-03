import { removeRule } from "../../security/sg-manager";
import { state } from "../../core/state";

export async function handleUnblock(req, res) {
  let body = "";
  req.on("data", d => body += d);
  req.on("end", async () => {
    const { ip } = JSON.parse(body);
    await removeRule(ip);
    state.blockedIps.delete(ip);
    respond(res, 200, { ok: true });
  });
}
