import fs from "fs";

export async function handleTail(req, res) {
  let body = "";
  req.on("data", d => body += d);
  req.on("end", async () => {
    const { file, lines = 200 } = JSON.parse(body);

    const buf = execSync(`tail -n ${lines} ${file}`).toString();
    respond(res, 200, { ok: true, data: buf });
  });
}
