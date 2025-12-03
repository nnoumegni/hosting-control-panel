import { startApiServer } from "./api/server";
import { startScheduler } from "./core/scheduler";
import { startTailer } from "./logs/tailer";
import { initGeoIP } from "./geo/geoip";

async function main() {
  await initGeoIP();
  startTailer();
  startScheduler();
  startApiServer();
}

main();
