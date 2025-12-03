import fs from 'fs';
import path from 'path';
import https from 'https';
import { createReadStream, createWriteStream } from 'fs';
import { createGunzip } from 'zlib';
import tar from 'tar';
import { logger } from '../../core/logger/index.js';

const GEO_BASE_DIR = process.env.GEO_BASE_DIR || '/tmp/geo';
// The geolite-city.tar.gz contains GeoLite2-City.mmdb which also has country data
const COUNTRY_DB_PATH = path.join(GEO_BASE_DIR, 'GeoLite2-City.mmdb');
const COUNTRY_DB_URL = process.env.GEO_COUNTRY_DB_URL || 'https://api.jetcamer.com/download/geolite-city.tar.gz';
const ASN_DB_PATH = path.join(GEO_BASE_DIR, 'GeoLite2-ASN.mmdb');
const ASN_DB_URL = process.env.GEO_ASN_DB_URL || 'https://api.jetcamer.com/download/geolite-asn.tar.gz';

let maxmind: any = null;
let countryReader: any = null;
let asnReader: any = null;
let dbLoaded = false;
let updateInProgress = false;

// Lazy load maxmind module
async function getMaxmind() {
  if (!maxmind) {
    maxmind = await import('maxmind');
  }
  return maxmind;
}

async function ensureGeoDir() {
  if (!fs.existsSync(GEO_BASE_DIR)) {
    fs.mkdirSync(GEO_BASE_DIR, { recursive: true });
  }
}

async function downloadAndExtract(url: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tarPath = path.join(outputDir, 'temp.tar.gz');
    const file = createWriteStream(tarPath);

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download GeoIP DB: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        // Extract tar.gz
        createReadStream(tarPath)
          .pipe(createGunzip())
          .pipe(
            tar.extract({
              cwd: outputDir,
              strip: 1,
            }),
          )
          .on('end', () => {
            fs.unlinkSync(tarPath);
            resolve();
          })
          .on('error', reject);
      });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadCountryDatabase(): Promise<void> {
  logger.info('Downloading GeoLite2-Country database...');
  await ensureGeoDir();
  await downloadAndExtract(COUNTRY_DB_URL, GEO_BASE_DIR);
  logger.info('GeoLite2-Country database downloaded');
}

async function downloadASNDatabase(): Promise<void> {
  logger.info('Downloading GeoLite2-ASN database...');
  await ensureGeoDir();
  await downloadAndExtract(ASN_DB_URL, GEO_BASE_DIR);
  logger.info('GeoLite2-ASN database downloaded');
}

async function loadDatabases(): Promise<void> {
  const maxmindLib = await getMaxmind();

  // Try to load country database - check for City, Country, or the configured path
  const cityDbPath = path.join(GEO_BASE_DIR, 'GeoLite2-City.mmdb');
  const countryDbPath = path.join(GEO_BASE_DIR, 'GeoLite2-Country.mmdb');
  
  let countryPath: string | null = null;
  if (fs.existsSync(COUNTRY_DB_PATH)) {
    countryPath = COUNTRY_DB_PATH;
  } else if (fs.existsSync(cityDbPath)) {
    countryPath = cityDbPath;
  } else if (fs.existsSync(countryDbPath)) {
    countryPath = countryDbPath;
  }

  if (countryPath) {
    try {
      // maxmind.open() can accept a file path directly
      countryReader = await maxmindLib.open(countryPath);
      logger.info(`Country database loaded from ${path.basename(countryPath)}`);
    } catch (err) {
      logger.error({ err }, 'Failed to load Country database');
    }
  }

  if (fs.existsSync(ASN_DB_PATH)) {
    try {
      // maxmind.open() can accept a file path directly
      asnReader = await maxmindLib.open(ASN_DB_PATH);
      logger.info('GeoLite2-ASN database loaded');
    } catch (err) {
      logger.error({ err }, 'Failed to load ASN database');
    }
  }
}

export async function initializeGeoIP(): Promise<void> {
  if (dbLoaded) {
    return;
  }

  try {
    // Download databases if they don't exist
    if (!fs.existsSync(COUNTRY_DB_PATH)) {
      try {
        await downloadCountryDatabase();
      } catch (err) {
        logger.warn({ err }, 'Failed to download Country database, continuing without it');
      }
    }

    if (!fs.existsSync(ASN_DB_PATH)) {
      try {
        await downloadASNDatabase();
      } catch (err) {
        logger.warn({ err }, 'Failed to download ASN database, continuing without it');
      }
    }

    // Load databases
    await loadDatabases();
    dbLoaded = true;
  } catch (err) {
    logger.error({ err }, 'Failed to initialize GeoIP');
  }
}

function shouldUpdateDatabases(): boolean {
  // Check if databases exist and are less than 24 hours old
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  // Check if files exist (City database contains country data)
  const cityDbPath = path.join(GEO_BASE_DIR, 'GeoLite2-City.mmdb');
  const countryDbPath = path.join(GEO_BASE_DIR, 'GeoLite2-Country.mmdb');
  const hasCountryDb = fs.existsSync(COUNTRY_DB_PATH) || fs.existsSync(cityDbPath) || fs.existsSync(countryDbPath);
  
  if (!hasCountryDb || !fs.existsSync(ASN_DB_PATH)) {
    return true; // Need to download if missing
  }

  // Use whichever country database exists
  const actualCountryPath = fs.existsSync(COUNTRY_DB_PATH) 
    ? COUNTRY_DB_PATH 
    : (fs.existsSync(cityDbPath) ? cityDbPath : countryDbPath);
  
  const countryStats = fs.statSync(actualCountryPath);
  const asnStats = fs.statSync(ASN_DB_PATH);
  const now = Date.now();
  
  const countryAge = now - countryStats.mtimeMs;
  const asnAge = now - asnStats.mtimeMs;
  
  // Update if either database is older than 24 hours
  return countryAge > maxAge || asnAge > maxAge;
}

export async function updateGeoDatabases(): Promise<void> {
  if (updateInProgress) {
    logger.debug('GeoIP database update already in progress');
    return;
  }

  // Check if update is needed
  if (!shouldUpdateDatabases()) {
    logger.debug('GeoIP databases are up to date, skipping update');
    return;
  }

  updateInProgress = true;
  try {
    logger.info('Updating GeoIP databases...');
    await downloadCountryDatabase();
    await downloadASNDatabase();
    await loadDatabases();
    logger.info('GeoIP databases updated successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to update GeoIP databases');
  } finally {
    updateInProgress = false;
  }
}

export function lookupCountry(ip: string): string | null {
  if (!countryReader || !ip) {
    return null;
  }

  try {
    // Skip private IPs
    if (
      ip.startsWith('127.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.20.') ||
      ip.startsWith('172.21.') ||
      ip.startsWith('172.22.') ||
      ip.startsWith('172.23.') ||
      ip.startsWith('172.24.') ||
      ip.startsWith('172.25.') ||
      ip.startsWith('172.26.') ||
      ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') ||
      ip.startsWith('172.29.') ||
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.')
    ) {
      return null;
    }

    const result = countryReader.get(ip);
    return result?.country?.iso_code || null;
  } catch (err) {
    logger.debug({ err, ip }, 'Failed to lookup country for IP');
    return null;
  }
}

export function lookupASN(ip: string): { asn?: number; org?: string } | null {
  if (!asnReader || !ip) {
    return null;
  }

  try {
    const result = asnReader.get(ip);
    return {
      asn: result?.autonomous_system_number,
      org: result?.autonomous_system_organization,
    };
  } catch (err) {
    logger.debug({ err, ip }, 'Failed to lookup ASN for IP');
    return null;
  }
}

// Start daily auto-updater
export function startGeoIPUpdater(): void {
  // Don't update immediately - initializeGeoIP() already handles initial download
  // Just set up the 24-hour interval check
  setInterval(() => {
    void updateGeoDatabases();
  }, 24 * 60 * 60 * 1000);

  logger.info('GeoIP auto-updater started (daily updates)');
}

