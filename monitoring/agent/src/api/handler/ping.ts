export async function handlePing(req, res) {
  respond(res, 200, { status: "ok", ts: Date.now() });
}
