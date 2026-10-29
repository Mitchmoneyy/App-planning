/**
 * Download every OpenStreetMap place of worship (all religions) with building
 * outlines, through the Overpass API, in world tiles that split themselves
 * when a query is too large. Writes pipeline/in/osm/<tile>.ndjson.
 *
 *   node pipeline/osm_overpass.mjs --out pipeline/in/osm [--max-minutes 200] [--max-age-days 40] [--endpoint URL[,URL…]]
 *
 * Each line: { type, id, lon, lat, tags, geometry? (GeoJSON polygon for ways/relations) }
 * Re-running skips finished tiles, so it can resume: with --max-minutes it stops
 * cleanly when time is up, and the next run (GitHub Actions caches the folder)
 * carries on where it left off. Areas older than --max-age-days are fetched
 * again, so the data stays fresh; the old copy is kept until the new one arrives.
 *
 * Overpass is a free, shared service: when one public server is busy we move
 * on to the next, pause between requests, and never run two downloads at once.
 * (For a planet-file route, see pipeline/README.md: osmium.)
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const OUT = opt("out", "pipeline/in/osm");
// Public Overpass servers, tried in turn when one is busy.
const ENDPOINTS = opt("endpoint", "")
  ? opt("endpoint").split(",")
  : ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
let current = 0;
const nextServer = () => (current = (current + 1) % ENDPOINTS.length);
const MAX_AGE_MS = Number(opt("max-age-days", "40")) * 24 * 3600 * 1000;
let gaveUp = 0;
const DEADLINE = Date.now() + Number(opt("max-minutes", "100000")) * 60_000;
let outOfTime = false;
fs.mkdirSync(OUT, { recursive: true });

const RELIGIOUS_BUILDINGS = "church|cathedral|chapel|mosque|temple|synagogue|shrine|religious|monastery|gurdwara|kingdom_hall";

// Overpass allows one geometry mode per "out", so each element type gets its own:
// nodes as points, ways with their outline, relations (big complexes) as a centre point.
function query([s, w, n, e]) {
  const bb = `${s},${w},${n},${e}`;
  return `[out:json][timeout:300];
(
  nwr["amenity"="place_of_worship"](${bb});
  wr["building"~"^(${RELIGIOUS_BUILDINGS})$"]["name"](${bb});
)->.all;
node.all;
out tags qt;
way.all;
out tags geom qt;
rel.all;
out tags center qt;`;
}

const ring = (pts) => pts.map((p) => [Math.round(p.lon * 1e7) / 1e7, Math.round(p.lat * 1e7) / 1e7]);

/** Centre of an outline: the average of its corners (good enough to place a pin). */
function centre(pts) {
  const uniq = pts.slice(0, pts.length > 1 && pts[0].lat === pts.at(-1).lat && pts[0].lon === pts.at(-1).lon ? -1 : undefined);
  const lon = uniq.reduce((a, p) => a + p.lon, 0) / uniq.length;
  const lat = uniq.reduce((a, p) => a + p.lat, 0) / uniq.length;
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

function toRow(el) {
  const row = { type: el.type, id: el.id, tags: el.tags ?? {} };
  if (el.type === "node") [row.lon, row.lat] = [el.lon, el.lat];
  else if (el.type === "way" && el.geometry?.length) {
    [row.lon, row.lat] = centre(el.geometry);
    const closed = el.geometry.length > 3 && el.geometry[0].lat === el.geometry.at(-1).lat && el.geometry[0].lon === el.geometry.at(-1).lon;
    if (closed) row.geometry = { type: "Polygon", coordinates: [ring(el.geometry)] };
  } else if (el.center) [row.lon, row.lat] = [el.center.lon, el.center.lat];
  return row.lon == null ? null : row;
}

// A small report, kept across runs and copied into the published stats.json,
// so a run can be checked without opening its logs.
const REPORT = path.join(OUT, "_report.json");
const report = { tiles: 0, rows: 0, errors: {}, lastError: null, split: [], ...(fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : {}) };
report.split ??= [];
const noteError = (kind, detail) => {
  report.errors[kind] = (report.errors[kind] ?? 0) + 1;
  report.lastError = `${kind}: ${String(detail).slice(0, 300)}`;
};
const saveReport = () => fs.writeFileSync(REPORT, JSON.stringify({ ...report, updatedAt: new Date().toISOString() }, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(bbox, depth = 0) {
  const name = bbox.map((v) => v.toFixed(2)).join("_");
  const file = path.join(OUT, `${name}.ndjson`);
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < MAX_AGE_MS) return; // fresh enough
  // Known to be too big for one request: go straight to its quarters.
  if (report.split.includes(name) && depth < 7) return split(bbox, depth);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (Date.now() >= DEADLINE) {
      outOfTime = true;
      return;
    }
    let res, text;
    try {
      res = await fetch(ENDPOINTS[current], { method: "POST", body: new URLSearchParams({ data: query(bbox) }), headers: { "User-Agent": "GlobalSanctuary/1.0 (places pipeline)" } });
      text = await res.text();
    } catch (err) {
      noteError("network", err);
      nextServer();
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    if (res.status === 400) {
      // The query itself is wrong: retrying or splitting won't help.
      noteError("bad-query", text);
      saveReport();
      throw new Error(`Overpass rejected the query: ${text.slice(0, 500)}`);
    }
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      noteError(`busy-${res.status}`, `${ENDPOINTS[current]} ${text.slice(0, 120)}`);
      nextServer(); // this server is busy: try the next one
      await sleep(attempt < ENDPOINTS.length ? 5_000 : 30_000 * (attempt + 1));
      continue;
    }
    const tooBig = text.includes('"remark": "runtime error') || text.includes("runtime error: Query timed out") || text.includes("out of memory");
    if (res.ok && !tooBig) {
      const rows = JSON.parse(text).elements.map(toRow).filter(Boolean);
      fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
      report.tiles++;
      report.rows += rows.length;
      saveReport();
      console.log(name, rows.length);
      await sleep(1500); // be polite to the shared server
      return;
    }
    if (tooBig && depth < 7) {
      noteError("too-big-split", name);
      if (!report.split.includes(name)) report.split.push(name);
      saveReport();
      return split(bbox, depth);
    }
    noteError(`http-${res.status}`, text.slice(0, 200));
    await sleep(20_000 * (attempt + 1));
  }
  gaveUp++;
  console.warn(name, "gave up for this run; it will be retried next run");
}

async function split([s, w, n, e], depth) {
  const ms = (s + n) / 2, mw = (w + e) / 2;
  for (const b of [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]]) await fetchTile(b, depth + 1);
}

// 10° x 10° world grid; dense areas split automatically.
for (let s = -60; s < 80; s += 10) for (let w = -180; w < 180; w += 10) await fetchTile([s, w, s + 10, w + 10]);
// Complete = every area of the world is downloaded and fresh.
report.complete = !outOfTime && gaveUp === 0;
if (report.complete) report.completedAt = new Date().toISOString();
saveReport();
const done = fs.readdirSync(OUT).filter((f) => f.endsWith(".ndjson")).length;
console.log("report:", JSON.stringify(report));
console.log(outOfTime ? `Time is up after ${done} tiles; the next run will continue from here.` : `done (${done} tiles)`);
