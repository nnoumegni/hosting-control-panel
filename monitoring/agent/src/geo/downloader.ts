// agent/src/geo/downloader.ts
import fs from "fs";
import path from "path";
import { logger } from "../core/logger";
import { execSync } from "child_process";

const BASE = "/var/lib/jetcamer/geo";
const TMP = "/tmp/geo-download";

const ASN_URL =
  "https://api.jetcamer.com/download/security/geo/maxmind-ASN.tar.gz";
const COUNTRY_URL =
  "https://api.jetcamer.com/download/security/geo/maxmind-Country.tar.gz";

export async function ensureDirs() {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });
}

async function download(url: string, output: string) {
  logger.info("Downloading", url);

  execSync(`curl -sSL ${url} -o ${output}`);
}

export async function updateGeoDatabases() {
  await ensureDirs();

  const asnTar = path.join(TMP, "asn.tar.gz");
  const countryTar = path.join(TMP, "country.tar.gz");

  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP);

  try {
    await download(ASN_URL, asnTar);
    await download(COUNTRY_URL, countryTar);

    execSync(`tar -xzf ${asnTar} -C ${BASE}`);
    execSync(`tar -xzf ${countryTar} -C ${BASE}`);

    logger.info("GeoIP DBs updated");
  } catch (e) {
    logger.error("Geo DB update failed:", e);
  }
}
