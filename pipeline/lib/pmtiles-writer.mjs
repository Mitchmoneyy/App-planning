/**
 * Minimal PMTiles v3 writer (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md).
 * Tiles are added in any order; identical tiles are stored once.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { zxyToTileId } from "pmtiles";

function varint(out, n) {
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

function serializeDirectory(entries) {
  const b = [];
  varint(b, entries.length);
  let last = 0;
  for (const e of entries) {
    varint(b, e.tileId - last);
    last = e.tileId;
  }
  for (const e of entries) varint(b, e.runLength);
  for (const e of entries) varint(b, e.length);
  entries.forEach((e, i) => {
    if (i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length) varint(b, 0);
    else varint(b, e.offset + 1);
  });
  return zlib.gzipSync(Buffer.from(b));
}

function buildDirectories(entries) {
  const root = serializeDirectory(entries);
  if (root.length <= 16384 - 127) return { root, leaves: Buffer.alloc(0) };
  for (let leafSize = 4096; ; leafSize *= 2) {
    const leafBufs = [];
    const rootEntries = [];
    let offset = 0;
    for (let i = 0; i < entries.length; i += leafSize) {
      const buf = serializeDirectory(entries.slice(i, i + leafSize));
      rootEntries.push({ tileId: entries[i].tileId, offset, length: buf.length, runLength: 0 });
      leafBufs.push(buf);
      offset += buf.length;
    }
    const r = serializeDirectory(rootEntries);
    if (r.length <= 16384 - 127) return { root: r, leaves: Buffer.concat(leafBufs) };
  }
}

export class PMTilesWriter {
  constructor(tmpPath) {
    this.tmpPath = tmpPath;
    this.fd = fs.openSync(tmpPath, "w");
    this.offset = 0;
    this.byHash = new Map();
    this.entries = [];
    this.contents = 0;
  }

  /** data: gzipped MVT bytes */
  add(z, x, y, data) {
    const tileId = zxyToTileId(z, x, y);
    const hash = crypto.createHash("sha1").update(data).digest("hex");
    let loc = this.byHash.get(hash);
    if (!loc) {
      fs.writeSync(this.fd, data);
      loc = { offset: this.offset, length: data.length };
      this.offset += data.length;
      this.byHash.set(hash, loc);
      this.contents++;
    }
    this.entries.push({ tileId, offset: loc.offset, length: loc.length, runLength: 1 });
  }

  finish(outPath, { minZoom, maxZoom, bounds = [-180, -85, 180, 85], center = [0, 20, 1], metadata = {} }) {
    fs.closeSync(this.fd);
    this.entries.sort((a, b) => a.tileId - b.tileId);
    // Merge runs of the same tile content at consecutive ids.
    const entries = [];
    for (const e of this.entries) {
      const prev = entries[entries.length - 1];
      if (prev && prev.offset === e.offset && prev.tileId + prev.runLength === e.tileId) prev.runLength++;
      else entries.push({ ...e });
    }
    const { root, leaves } = buildDirectories(entries);
    const meta = zlib.gzipSync(Buffer.from(JSON.stringify(metadata)));
    const h = Buffer.alloc(127);
    h.write("PMTiles", 0, "ascii");
    h.writeUInt8(3, 7);
    const rootOff = 127;
    const metaOff = rootOff + root.length;
    const leafOff = metaOff + meta.length;
    const dataOff = leafOff + leaves.length;
    const u64 = (v, at) => h.writeBigUInt64LE(BigInt(v), at);
    u64(rootOff, 8); u64(root.length, 16);
    u64(metaOff, 24); u64(meta.length, 32);
    u64(leafOff, 40); u64(leaves.length, 48);
    u64(dataOff, 56); u64(this.offset, 64);
    u64(this.entries.length, 72); u64(entries.length, 80); u64(this.contents, 88);
    h.writeUInt8(0, 96); // not clustered (data is in insertion order)
    h.writeUInt8(2, 97); // directories gzip
    h.writeUInt8(2, 98); // tiles gzip
    h.writeUInt8(1, 99); // MVT
    h.writeUInt8(minZoom, 100); h.writeUInt8(maxZoom, 101);
    const e7 = (v) => Math.round(v * 1e7);
    h.writeInt32LE(e7(bounds[0]), 102); h.writeInt32LE(e7(bounds[1]), 106);
    h.writeInt32LE(e7(bounds[2]), 110); h.writeInt32LE(e7(bounds[3]), 114);
    h.writeUInt8(center[2], 118); h.writeInt32LE(e7(center[0]), 119); h.writeInt32LE(e7(center[1]), 123);
    const out = fs.openSync(outPath, "w");
    for (const part of [h, root, meta, leaves]) fs.writeSync(out, part);
    const src = fs.openSync(this.tmpPath, "r");
    const buf = Buffer.alloc(8 << 20);
    for (let n; (n = fs.readSync(src, buf, 0, buf.length, null)) > 0; ) fs.writeSync(out, buf, 0, n);
    fs.closeSync(src);
    fs.closeSync(out);
    fs.unlinkSync(this.tmpPath);
    return { tiles: this.entries.length, unique: this.contents, bytes: dataOff + this.offset };
  }
}
