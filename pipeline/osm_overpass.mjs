/**
 * Download every OpenStreetMap place of worship (all religions) with building
 * outlines, through the Overpass API, in world tiles that split themselves
 * when a query is too large. Writes pipeline/in/osm/<tile>.ndjson.
 *
 *   node pipeline/osm_overpass.mjs --out pipeline/in/osm [--max-minutes 200] [--endpoint https://overpass-api.de/api/interpreter]
 *
 * Each line: { type, id, lon, lat, tags, geometry? (GeoJSON polygon for ways/relations) }
 * Re-running skips finished tiles, so it can resume: with --max-minutes it stops
 * cleanly when time is up, and the next run (GitHub Actions caches the folder)
 * carries on where it left off. Please keep it to one run
 * a month: Overpass is a free, shared service. (For a planet-file route,
 * see pipeline/README.md: osmium tags-filter + osmium export.)
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const OUT = opt("out", "pipeline/in/osm");
const ENDPOINT = opt("endpoint", "https://overpass-api.de/api/interpreter");
const DEADLINE = Date.now() + Number(opt("max-minutes", "100000")) * 60_000;
let outOfTime = false;
fs.mkdirSync(OUT, { recursive: true });

const RELIGIOUS_BUILDINGS = "church|cathedral|chapel|mosque|temple|synagogue|shrine|religious|monastery|gurdwara|kingdom_hall";

function query([s, w, n, e]) {
  const bb = `${s},${w},${n},${e}`;
  return `[out:json][timeout:600][maxsize:1073741824];
(
  nwr["amenity"="place_of_worship"](${bb});
  wr["building"~"^(${RELIGIOUS_BUILDINGS})$"]["name"](${bb});
);
out tags geom center qt;`;
}

const ring = (pts) => pts.map((p) => [Math.round(p.lon * 1e7) / 1e7, Math.round(p.lat * 1e7) / 1e7]);

function toRow(el) {
  const row = { type: el.type, id: el.id, tags: el.tags ?? {} };
  if (el.type === "node") [row.lon, row.lat] = [el.lon, el.lat];
  else if (el.center) [row.lon, row.lat] = [el.center.lon, el.center.lat];
  if (el.type === "way" && el.geometry?.length > 3) row.geometry = { type: "Polygon", coordinates: [ring(el.geometry)] };
  if (el.type === "relation" && el.members) {
    const outers = el.members.filter((m) => m.role === "outer" && m.geometry?.length > 3).map((m) => [ring(m.geometry)]);
    if (outers.length) row.geometry = { type: "MultiPolygon", coordinates: outers };
  }
  return row.lon == null ? null : row;
}

async function fetchTile(bbox, depth = 0) {
  const name = bbox.map((v) => v.toFixed(2)).join("_");
  const file = path.join(OUT, `${name}.ndjson`);
  if (fs.existsSync(file)) return;
  if (Date.now() >= DEADLINE) {
    outOfTime = true;
    return;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    if (Date.now() >= DEADLINE) {
      outOfTime = true;
      return;
    }
    try {
      const res = await fetch(ENDPOINT, { method: "POST", body: new URLSearchParams({ data: query(bbox) }), headers: { "User-Agent": "GlobalSanctuary/1.0 (places pipeline)" } });
      if (res.status === 429 || res.status === 504) throw new Error(`busy ${res.status}`);
      const text = await res.text();
      if (!res.ok || text.includes('"remark": "runtime error')) {
        if (depth < 6) return split(bbox, depth); // too big: split into 4
        throw new Error(text.slice(0, 200));
      }
      const rows = JSON.parse(text).elements.map(toRow).filter(Boolean);
      fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
      console.log(name, rows.length);
      return;
    } catch (err) {
      console.warn(name, String(err).slice(0, 120));
      await new Promise((r) => setTimeout(r, 30_000 * (attempt + 1)));
    }
  }
  if (depth < 6 && !outOfTime) return split(bbox, depth);
}

async function split([s, w, n, e], depth) {
  const ms = (s + n) / 2, mw = (w + e) / 2;
  for (const b of [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]]) await fetchTile(b, depth + 1);
}

// 20° x 20° world grid; dense areas split automatically.
for (let s = -60; s < 80; s += 20) for (let w = -180; w < 180; w += 20) await fetchTile([s, w, s + 20, w + 20]);
const done = fs.readdirSync(OUT).filter((f) => f.endsWith(".ndjson")).length;
console.log(outOfTime ? `Time is up after ${done} tiles; the next run will continue from here.` : `done (${done} tiles)`);
