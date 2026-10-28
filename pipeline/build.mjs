/**
 * Global Sanctuary places pipeline: merge -> de-duplicate -> normalise -> tiles.
 *
 * Sources (all optional except curated):
 *   public/data/places.geojson             hand-curated landmarks (with Wikidata/Wikipedia)
 *   <in>/osm/*.ndjson(.gz)                 OpenStreetMap places of worship (pipeline/osm_overpass.mjs)
 *   <in>/overture/*.ndjson.gz              Overture Maps places (pipeline/overture_places.py)
 *   <in>/footprints.ndjson                 building outlines (pipeline/overture_footprints.py)
 *
 * Output (<out>):
 *   places.pmtiles   vector tiles: layers "places" (clustered below z12), "landmarks", "footprints"
 *   places.ndjson.gz one row per place, for loading into Postgres (db/places.sql)
 *   stats.json       counts by faith / source / country
 *
 *   node --max-old-space-size=8000 pipeline/build.mjs --in /var/tmp/gs-data --out pipeline/out/world
 *   node pipeline/build.mjs --in ... --out public/data/sample --only-footprinted   (small demo set)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import GeoJSONVT from "geojson-vt";
import Supercluster from "supercluster";
import vtpbf from "vt-pbf";
import { fromOsm, fromOverture } from "./lib/faith.mjs";
import { PMTilesWriter } from "./lib/pmtiles-writer.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]] : null)).filter(Boolean),
);
const IN = args.in ?? "pipeline/in";
const OUT = args.out ?? "pipeline/out/world";
const ONLY_FP = !!args["only-footprinted"];
// --sample: landmarks + everything around a few showcase cities (small enough to ship in the repo).
const SAMPLE = !!args.sample;
const SAMPLE_CITIES = [
  [12.4823, 41.8955], [35.2316, 31.7767], [28.975, 41.01], [135.768, 35.0116], [83.0097, 25.3109], [74.8765, 31.62],
  [-73.985, 40.758], [-0.1276, 51.5072], [100.4935, 13.7525], [31.2357, 30.0444], [2.3488, 48.8534], [-99.1332, 19.4326],
];
const inSample = (p) => SAMPLE_CITIES.some(([x, y]) => Math.abs(p.lon - x) < 0.3 && Math.abs(p.lat - y) < 0.22);
const MAX_Z = 12;
const EXTENT = 8192;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function* lines(file) {
  if (!fs.existsSync(file)) return;
  let stream = fs.createReadStream(file);
  if (file.endsWith(".gz")) stream = stream.pipe(zlib.createGunzip());
  for await (const l of readline.createInterface({ input: stream, crlfDelay: Infinity })) if (l.trim()) yield JSON.parse(l);
}
const filesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ndjson(\.gz)?$/.test(f)).sort().map((f) => path.join(dir, f)) : []);

// ---------- footprints ----------
const footprints = new Map();
for await (const f of lines(path.join(IN, "footprints.ndjson"))) footprints.set(f.id, f);
log("footprints", footprints.size);

// ---------- de-duplication index ----------
const CELL = 0.002; // ~200 m
const grid = new Map();
const cellKey = (lon, lat) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;
const STOP = new Set("the of a an and church mosque masjid temple synagogue chapel cathedral basilica parish st saint san santa sao são sainte de la le les el del di da do dos das du der die das von iglesia igreja eglise église kirche chiesa parroquia paroquia paróquia shrine jinja wat mandir gurdwara gurudwara holy sacred".split(" "));
const norm = (s) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function tokens(name) {
  const all = norm(name).split(" ").filter(Boolean);
  const core = all.filter((t) => !STOP.has(t));
  return new Set(core.length ? core : all);
}
function similar(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}
const metres = (a, b) => {
  const dx = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * 110540;
  return Math.hypot(dx, dy);
};

const places = [];
const stats = { bySource: {}, merged: 0, dropped: 0 };

function findDuplicate(p) {
  const cx = Math.floor(p.lon / CELL), cy = Math.floor(p.lat / CELL);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      for (const q of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        if (p.building && q.building === p.building) return q;
        const d = metres(p, q);
        if (d > 250) continue;
        const s = similar(p._tok, q._tok);
        if ((s >= 0.6 && d <= 150) || (s === 1 && norm(p.name) === norm(q.name))) return q;
      }
    }
  return null;
}

function add(p) {
  const fp = footprints.get(p._fpKey);
  if (fp) {
    p.building = fp.building;
    p.footprint = fp.geometry;
    p.height = fp.height ?? null;
    [p.lon, p.lat] = fp.centroid; // pin on the building, not the street
  }
  if (ONLY_FP && !fp && !p.landmark) return;
  if (SAMPLE && !p.landmark && !inSample(p)) return;
  p._tok = tokens(p.name);
  const dup = findDuplicate(p);
  if (dup) {
    for (const k of ["tradition", "address", "city", "region", "postcode", "cc", "website", "wikidata", "wikipedia", "footprint", "building", "height"])
      if (dup[k] == null && p[k] != null) dup[k] = p[k];
    dup.sources.push(...p.sources);
    stats.merged++;
    return;
  }
  const key = cellKey(p.lon, p.lat);
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(p);
  places.push(p);
  stats.bySource[p.sources[0]] = (stats.bySource[p.sources[0]] ?? 0) + 1;
}

// 1. Curated landmarks (highest priority; keep their readable ids).
const curated = JSON.parse(fs.readFileSync("public/data/places.geojson", "utf8"));
for (const f of curated.features) {
  const pr = f.properties;
  add({
    id: pr.id, name: pr.name, faith: pr.faith, tradition: pr.tradition, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    address: null, city: pr.city, region: null, postcode: null, cc: null, country: pr.country, website: pr.website,
    wikidata: pr.wikidata, wikipedia: pr.wikipedia, heritage: !!pr.heritage, landmark: true, sources: ["curated"], _fpKey: `c:${pr.id}`,
  });
}
log("curated", places.length);

// 2. OpenStreetMap.
for (const file of filesIn(path.join(IN, "osm"))) {
  for await (const r of lines(file)) {
    const t = r.tags ?? {};
    if (!t.name) continue;
    const { faith, tradition } = fromOsm(t, r.cc);
    add({
      id: null, srcId: `osm:${r.type}/${r.id}`, name: t["name:en"] && /[^\x00-\x7f]/.test(t.name) ? t["name:en"] : t.name, faith, tradition,
      lon: r.lon, lat: r.lat, address: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null,
      city: t["addr:city"] ?? null, region: null, postcode: t["addr:postcode"] ?? null, cc: r.cc ?? null, website: t.website ?? t["contact:website"] ?? null,
      wikidata: t.wikidata ?? null, wikipedia: t.wikipedia ?? null, heritage: !!t.heritage, landmark: !!(t.wikidata && t.wikipedia),
      sources: ["osm"], _fpKey: `osm:${r.type}/${r.id}`, footprintInline: r.geometry ?? null,
    });
  }
}
log("after osm", places.length);

// 3. Overture.
let seen = 0;
for (const file of filesIn(path.join(IN, "overture"))) {
  for await (const r of lines(file)) {
    seen++;
    if (!r.name || r.confidence < 0.45 || (r.status && r.status !== "open")) {
      stats.dropped++;
      continue;
    }
    const { faith, tradition } = fromOverture(r.category, r.name, r.country);
    add({
      id: null, srcId: `ov:${r.id}`, name: r.name, faith, tradition, lon: r.lon, lat: r.lat,
      address: r.address ?? null, city: r.locality ?? null, region: r.region ?? null, postcode: r.postcode ?? null, cc: r.country ?? null,
      website: r.website ?? null, wikidata: null, wikipedia: null, heritage: false, landmark: false, sources: ["overture"], _fpKey: `o:${r.id}`,
    });
  }
  log(path.basename(file), "places so far", places.length);
}
log("overture rows", seen, "kept", places.length, "merged", stats.merged);

// ---------- ids ----------
const tileXY = (lon, lat, z) => {
  const n = 2 ** z;
  const x = Math.min(n - 1, Math.floor(((lon + 180) / 360) * n));
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  const y = Math.min(n - 1, Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n));
  return [x, y];
};
for (const p of places) {
  if (p.footprintInline && !p.footprint) p.footprint = p.footprintInline;
  delete p.footprintInline;
  if (p.id) continue;
  const [x, y] = tileXY(p.lon, p.lat, MAX_Z);
  const h = parseInt(crypto.createHash("sha1").update(p.srcId).digest("hex").slice(0, 10), 16).toString(36);
  p.id = `${x.toString(36)}-${y.toString(36)}-${h}`; // the z12 tile is encoded in the id, so a place can be found from tiles alone
}

// ---------- tiles ----------
const props = (p) => {
  const o = { id: p.id, name: p.name, faith: p.faith };
  if (p.tradition) o.tradition = p.tradition;
  if (p.address) o.address = p.address;
  if (p.city) o.city = p.city;
  if (p.cc) o.cc = p.cc;
  if (p.country) o.country = p.country;
  if (p.website) o.website = p.website;
  if (p.wikidata) o.wikidata = p.wikidata;
  if (p.wikipedia) o.wikipedia = p.wikipedia;
  if (p.heritage) o.heritage = 1;
  if (p.footprint) o.footprint = 1;
  if (p.landmark) o.landmark = 1;
  return o;
};

// Below street zoom, a place only needs enough to draw its icon and label.
const brief = (t) => ({ id: t.id, name: t.name, faith: t.faith });

const regular = places.filter((p) => !p.landmark);
const landmarks = places.filter((p) => p.landmark);
log("indexing", regular.length, "places +", landmarks.length, "landmarks");
const index = new Supercluster({
  radius: 56, maxZoom: MAX_Z - 1, minPoints: 3, extent: EXTENT,
  // Clusters keep a count per faith (n_islam, n_hinduism, …) so filters stay accurate when zoomed out.
  map: (p) => ({ faith: p.faith, [`n_${p.faith}`]: 1 }),
  reduce: (a, b) => {
    if (a.faith !== b.faith) a.faith = "mixed";
    for (const k in b) if (k.startsWith("n_")) a[k] = (a[k] ?? 0) + b[k];
  },
});
index.load(regular.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: props(p) })));

const fpIndex = new GeoJSONVT(
  { type: "FeatureCollection", features: places.filter((p) => p.footprint).map((p) => ({ type: "Feature", geometry: p.footprint, properties: { id: p.id, faith: p.faith, height: p.height ?? 0 } })) },
  { maxZoom: MAX_Z, indexMaxZoom: 5, extent: EXTENT, buffer: 64, tolerance: 1 },
);

// Landmarks per tile, with a small buffer so icons near edges aren't clipped.
function landmarkTile(z, x, y) {
  const n = 2 ** z;
  const feats = [];
  for (const p of landmarkByTile[z].get(`${x}/${y}`) ?? []) {
    const px = ((p.lon + 180) / 360) * n;
    const s = Math.sin((p.lat * Math.PI) / 180);
    const py = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    feats.push({ type: 1, geometry: [[Math.round((px - x) * EXTENT), Math.round((py - y) * EXTENT)]], tags: props(p) });
  }
  return feats;
}
const landmarkByTile = [];
for (let z = 0; z <= MAX_Z; z++) {
  const m = new Map();
  for (const p of landmarks) {
    const [x, y] = tileXY(p.lon, p.lat, z);
    const k = `${x}/${y}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  landmarkByTile.push(m);
}

const writer = new PMTilesWriter(path.join(OUT, "tiles.tmp"));
let tiles = 0;
for (let z = 0; z <= MAX_Z; z++) {
  const keys = new Set(landmarkByTile[z].keys());
  if (z < MAX_Z) for (const c of index.getClusters([-180, -85.05, 180, 85.05], z)) keys.add(tileXY(...c.geometry.coordinates, z).join("/"));
  else for (const p of regular) keys.add(tileXY(p.lon, p.lat, z).join("/"));
  if (z >= 11) for (const p of places) if (p.footprint) keys.add(tileXY(p.lon, p.lat, z).join("/"));
  for (const k of keys) {
    const [x, y] = k.split("/").map(Number);
    const layers = {};
    const pts = (index.getTile(z, x, y)?.features ?? []).map((f) => (z < MAX_Z && !f.tags.cluster ? { ...f, tags: brief(f.tags) } : f));
    if (pts.length) layers.places = { features: pts };
    const lm = landmarkTile(z, x, y);
    if (lm.length) layers.landmarks = { features: lm };
    if (z >= 11) {
      const fp = fpIndex.getTile(z, x, y)?.features ?? [];
      if (fp.length) layers.footprints = { features: fp };
    }
    if (!Object.keys(layers).length) continue;
    writer.add(z, x, y, zlib.gzipSync(Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2, extent: EXTENT }))));
    tiles++;
  }
  log(`z${z}: ${keys.size} tiles`);
}

const byFaith = {};
const byCountry = {};
for (const p of places) {
  byFaith[p.faith] = (byFaith[p.faith] ?? 0) + 1;
  if (p.cc) byCountry[p.cc] = (byCountry[p.cc] ?? 0) + 1;
}
const summary = {
  generatedAt: new Date().toISOString(), total: places.length, landmarks: landmarks.length,
  withFootprint: places.filter((p) => p.footprint).length, byFaith, bySource: stats.bySource, merged: stats.merged, dropped: stats.dropped,
  topCountries: Object.fromEntries(Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 40)),
};
const res = writer.finish(path.join(OUT, "places.pmtiles"), {
  minZoom: 0, maxZoom: MAX_Z, center: [0, 20, 1],
  metadata: {
    name: "Global Sanctuary places", attribution: "© OpenStreetMap contributors (ODbL), Overture Maps Foundation (CDLA-Permissive-2.0)",
    vector_layers: [
      { id: "places", fields: { id: "String", name: "String", faith: "String", point_count: "Number" }, minzoom: 0, maxzoom: MAX_Z },
      { id: "landmarks", fields: { id: "String", name: "String", faith: "String" }, minzoom: 0, maxzoom: MAX_Z },
      { id: "footprints", fields: { id: "String", faith: "String", height: "Number" }, minzoom: 11, maxzoom: MAX_Z },
    ],
    summary,
  },
});
log("pmtiles", res);

// Rows for the database / search.
const gz = zlib.createGzip();
const outRows = fs.createWriteStream(path.join(OUT, "places.ndjson.gz"));
gz.pipe(outRows);
for (const p of places) {
  const { _tok, _fpKey, srcId, ...row } = p;
  void _tok; void _fpKey;
  gz.write(JSON.stringify({ ...row, sourceIds: srcId ? [srcId] : [] }) + "\n");
}
gz.end();
await new Promise((r) => outRows.on("finish", r));
fs.writeFileSync(path.join(OUT, "stats.json"), JSON.stringify(summary, null, 2));
log("done", summary.total, "places");
