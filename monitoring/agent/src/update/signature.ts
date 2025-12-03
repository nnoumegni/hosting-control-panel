// agent/src/update/signature.ts
import crypto from "crypto";
import fs from "fs";

export function verifySignature(
  file: string,
  signature: string,
  publicKey: string
): boolean {
  const data = fs.readFileSync(file);

  const verify = crypto.createVerify("RSA-SHA256");
  verify.update(data);
  verify.end();

  return verify.verify(publicKey, Buffer.from(signature, "base64"));
}
