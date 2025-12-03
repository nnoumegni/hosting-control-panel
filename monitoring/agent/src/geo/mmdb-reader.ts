// agent/src/geo/mmdb-reader.ts
import { Reader } from "maxmind";
import fs from "fs";

export class MmdbReader<T = any> {
  private reader: Reader<T> | null = null;

  constructor(private filePath: string) {}

  async load() {
    if (!fs.existsSync(this.filePath)) {
      throw new Error("MMDB file not found: " + this.filePath);
    }

    const buff = fs.readFileSync(this.filePath);
    this.reader = await Reader.openBuffer(buff);
  }

  lookup(ip: string): T | null {
    if (!this.reader) return null;
    return this.reader.get(ip) || null;
  }
}
