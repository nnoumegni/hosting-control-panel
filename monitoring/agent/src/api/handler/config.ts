import { state } from "../../core/state";

export async function handleConfig(req, res) {
  let body = "";
  req.on("data", d => body += d);
  req.on("end", async () => {
    const cfg = JSON.parse(body);
    Object.assign(state.settings, cfg);
    respond(res, 200, { ok: true, newConfig: state.settings });
  });
}
