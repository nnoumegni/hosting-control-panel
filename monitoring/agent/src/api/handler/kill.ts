export async function handleKill(req, res) {
  respond(res, 200, { ok: true });
  process.exit(0);
}
