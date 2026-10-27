// Builds a tiny offline world map (country shapes) used as a fallback base map
// when the online map style can't be reached.
//
//   npm run data:land

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { feature } from "topojson-client";
import { ROOT } from "./lib/places-output.mjs";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"));
const countries = feature(topo, topo.objects.countries);

// Keep only shapes; drop properties to stay small.
for (const f of countries.features) f.properties = {};

const out = resolve(ROOT, "public/data/countries-110m.geojson");
mkdirSync(resolve(ROOT, "public/data"), { recursive: true });
writeFileSync(out, JSON.stringify(countries));
console.log(`Wrote ${countries.features.length} country shapes to ${out}`);
