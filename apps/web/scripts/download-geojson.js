#!/usr/bin/env node

/**
 * Downloads the countries GeoJSON file and saves it as a local asset
 * This script runs during yarn install to ensure the file is available locally
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
const OUTPUT_DIR = path.join(__dirname, '../public/assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'countries.geojson');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Check if file already exists
if (fs.existsSync(OUTPUT_FILE)) {
  console.log('✅ GeoJSON file already exists, skipping download');
  process.exit(0);
}

console.log('📥 Downloading countries GeoJSON file...');

const file = fs.createWriteStream(OUTPUT_FILE);

https.get(GEOJSON_URL, (response) => {
  if (response.statusCode !== 200) {
    console.error(`❌ Failed to download GeoJSON: HTTP ${response.statusCode}`);
    process.exit(1);
  }

  response.pipe(file);

  file.on('finish', () => {
    file.close();
    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`✅ GeoJSON file downloaded successfully (${(stats.size / 1024).toFixed(2)} KB)`);
    console.log(`   Saved to: ${OUTPUT_FILE}`);
  });
}).on('error', (err) => {
  fs.unlinkSync(OUTPUT_FILE); // Delete the file on error
  console.error(`❌ Error downloading GeoJSON: ${err.message}`);
  process.exit(1);
});

