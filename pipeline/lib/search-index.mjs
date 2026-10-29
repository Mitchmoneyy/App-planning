/**
 * Search index for every place, readable with HTTP range requests (no database).
 *
 * Layout:  "GSIDX1" | uint32 header length | gzip(JSON header) | gzip shards…
 * Header:  { version, places, shards: { key: [offset, length] } }  (offsets after the header)
 * Shard:   gzip(JSON array of [id, name, faith, lat, lon, detail, words])
 *
 * A place is filed under each of its words' prefixes (see src/lib/searchText.ts):
 * 2 letters normally, 3 letters where a 2-letter prefix would be too big.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { searchWords } from "../../src/lib/searchText.ts";

const MAX_PER_SHARD = 25_000;

export function writeSearchIndex(places, outPath, { detail }) {
  // word prefix (3 letters) -> entry indexes
  const rows = [];
  const by3 = new Map();
  for (const p of places) {
    const words = searchWords(p.name).slice(0, 6);
    if (!words.length) continue;
    const i = rows.length;
    rows.push([p.id, p.name, p.faith, Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5, detail(p), words.join(" ")]);
    for (const k of new Set(words.map((w) => w.slice(0, 3)))) {
      if (!by3.has(k)) by3.set(k, new Set());
      by3.get(k).add(i);
    }
  }
  // Merge 3-letter groups into their 2-letter prefix unless that would be too big.
  const by2 = new Map();
  for (const [k3, set] of by3) {
    const k2 = k3.slice(0, 2);
    if (!by2.has(k2)) by2.set(k2, []);
    by2.get(k2).push([k3, set]);
  }
  const shards = new Map();
  for (const [k2, groups] of by2) {
    const total = new Set(groups.flatMap(([, s]) => [...s]));
    if (total.size <= MAX_PER_SHARD) shards.set(k2, total);
    else for (const [k3, s] of groups) shards.set(k3, s);
  }

  const blobs = [];
  const dir = {};
  let offset = 0;
  for (const [key, set] of [...shards].sort()) {
    const buf = zlib.gzipSync(Buffer.from(JSON.stringify([...set].map((i) => rows[i]))));
    dir[key] = [offset, buf.length];
    offset += buf.length;
    blobs.push(buf);
  }
  const header = zlib.gzipSync(Buffer.from(JSON.stringify({ version: 1, places: rows.length, shards: dir })));
  const head = Buffer.alloc(10);
  head.write("GSIDX1", 0, "ascii");
  head.writeUInt32LE(header.length, 6);
  const fd = fs.openSync(outPath, "w");
  for (const b of [head, header, ...blobs]) fs.writeSync(fd, b);
  fs.closeSync(fd);
  return { places: rows.length, shards: shards.size, bytes: 10 + header.length + offset, biggest: Math.max(...blobs.map((b) => b.length)) };
}
