/**
 * Converts `osmium export -f geojsonseq -a type,id` output into the
 * { type, id, lon, lat, tags, geometry } lines build.mjs reads.
 *   node pipeline/osm_from_geojsonseq.mjs in.geojsonseq out.ndjson
 * Polygons (buildings, multipolygons) keep their outline; the pin goes on
 * the outline's centre.
 */
import fs from "node:fs";
import readline from "node:readline";

const [src, dst] = process.argv.slice(2);
const out = fs.createWriteStream(dst);
const round = (v) => Math.round(v * 1e7) / 1e7;

/** Area-weighted centre of a ring (falls back to the average of its corners). */
function ringCentre(ring) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    x += (x0 + x1) * f;
    y += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [x / (3 * a), y / (3 * a)];
}

const roundRing = (r) => r.map(([lon, lat]) => [round(lon), round(lat)]);

let n = 0;
for await (const raw of readline.createInterface({ input: fs.createReadStream(src), crlfDelay: Infinity })) {
  const line = raw.replace(/^\x1e/, "").trim();
  if (!line) continue;
  const f = JSON.parse(line);
  const { "@type": type, "@id": id, ...tags } = f.properties ?? {};
  const g = f.geometry;
  if (!g || !type) continue;
  const row = { type, id, tags };
  if (g.type === "Point") [row.lon, row.lat] = g.coordinates.map(round);
  else if (g.type === "Polygon") {
    [row.lon, row.lat] = ringCentre(g.coordinates[0]).map(round);
    row.geometry = { type: "Polygon", coordinates: g.coordinates.map(roundRing) };
  } else if (g.type === "MultiPolygon") {
    // Centre of the largest part.
    const largest = g.coordinates.reduce((best, poly) => (poly[0].length > best[0].length ? poly : best));
    [row.lon, row.lat] = ringCentre(largest[0]).map(round);
    row.geometry = { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(roundRing)) };
  } else continue;
  out.write(JSON.stringify(row) + "\n");
  n++;
}
out.end();
await new Promise((r) => out.on("finish", r));
console.log(`${n} places -> ${dst}`);
