// Builds public/data/places.geojson from the hand-curated starter list
// (data/curated-places.psv). Works offline.
//
//   npm run data:curated

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, writePlaces } from "./lib/places-output.mjs";

const file = resolve(ROOT, "data/curated-places.psv");
const lines = readFileSync(file, "utf8").split("\n");

const records = [];
lines.forEach((line, i) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return; // skip blanks and comments

  const cols = trimmed.split("|").map((c) => c.trim());
  if (cols.length !== 9) throw new Error(`Line ${i + 1}: expected 9 columns, got ${cols.length}`);

  const [name, faith, tradition, city, country, lat, lon, unesco, wikipedia] = cols;
  records.push({
    name,
    faith,
    tradition,
    city,
    country,
    lat: Number(lat),
    lon: Number(lon),
    heritage: unesco === "1",
    wikipedia: wikipedia || null,
  });
});

writePlaces(records, "curated");
