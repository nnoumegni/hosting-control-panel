import { restartAll } from "../../core/system";

export async function handleRestart(req, res) {
  await restartAll();
  respond(res, 200, { ok: true });
}
