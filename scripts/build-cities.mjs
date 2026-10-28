// Builds public/data/cities.json: world cities with 15,000+ people, used to
// round any location to its nearest city (never storing exact positions) and
// to search for a city to pray for.
//
// Source: GeoNames via the "all-the-cities" package (CC BY 4.0 — credit GeoNames).
//
//   npm run data:cities

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ROOT } from "./lib/places-output.mjs";

const require = createRequire(import.meta.url);
const all = require("all-the-cities");

const MIN_POPULATION = 15000;
// Real towns and cities only: skip city sections (PPLX, e.g. "Chicago Loop"),
// historical/abandoned places, and other non-settlement entries.
const SKIP_CODES = new Set(["PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH", "STLMT"]);
const round = (n) => Math.round(n * 100) / 100; // ~1 km: city centres only

// Compact rows: [geonameId, name, countryCode, lat, lon, population]
const rows = all
  .filter((c) => c.population >= MIN_POPULATION && c.country && c.name && !SKIP_CODES.has(c.featureCode))
  .sort((a, b) => b.population - a.population)
  .map((c) => [Number(c.cityId), c.name, c.country, round(c.loc.coordinates[1]), round(c.loc.coordinates[0]), c.population]);

// Country centre = population-weighted mean of its cities (good enough to aim an arc).
const byCountry = new Map();
for (const [, , cc, lat, lon, pop] of rows) {
  const s = byCountry.get(cc) ?? { lat: 0, lon: 0, w: 0 };
  s.lat += lat * pop;
  s.lon += lon * pop;
  s.w += pop;
  byCountry.set(cc, s);
}
const countries = Object.fromEntries([...byCountry].map(([cc, s]) => [cc, [round(s.lat / s.w), round(s.lon / s.w)]]));

const out = resolve(ROOT, "public/data/cities.json");
mkdirSync(resolve(ROOT, "public/data"), { recursive: true });
writeFileSync(out, JSON.stringify({ source: "GeoNames (CC BY 4.0)", cities: rows, countries }));
console.log(`Wrote ${rows.length} cities and ${Object.keys(countries).length} countries to ${out}`);
