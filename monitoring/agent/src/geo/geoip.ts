// agent/src/geo/geoip.ts
import { MmdbReader } from "./mmdb-reader";
import path from "path";
import { logger } from "../core/logger";

const GEO_DB = "/var/lib/jetcamer/geo/GeoLite2-ASN.mmdb";
const COUNTRY_DB = "/var/lib/jetcamer/geo/GeoLite2-Country.mmdb";

let asnDb: MmdbReader | null = null;
let countryDb: MmdbReader | null = null;

export async function initGeoIP() {
  try {
    asnDb = new MmdbReader(GEO_DB);
    await asnDb.load();

    countryDb = new MmdbReader(COUNTRY_DB);
    await countryDb.load();

    logger.info("GeoIP/MMDB loaded");
  } catch (e) {
    logger.error("Failed to load MMDB:", e);
  }
}

export interface GeoInfo {
  ip: string;
  asn?: number;
  org?: string;
  country?: string;
}

export function lookup(ip: string): GeoInfo {
  let result: GeoInfo = { ip };

  try {
    if (asnDb) {
      const asn = asnDb.lookup(ip) as any;
      if (asn?.autonomous_system_number) {
        result.asn = asn.autonomous_system_number;
        result.org = asn.autonomous_system_organization;
      }
    }

    if (countryDb) {
      const c = countryDb.lookup(ip) as any;
      result.country = c?.country?.iso_code;
    }
  } catch (e) {
    // ignore
  }

  return result;
}
