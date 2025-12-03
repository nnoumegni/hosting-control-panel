import { blockIp } from "../../security/blocker";

export async function handleBlock(req, res) {
  let body = "";
  req.on("data", d => body += d);
  req.on("end", async () => {
    const { ip, reason } = JSON.parse(body);
    await blockIp(ip, reason || "remote");
    respond(res, 200, { ok: true });
  });
}
