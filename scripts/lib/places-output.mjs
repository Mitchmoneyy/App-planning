// Shared helpers for the data scripts: turning place records into the
// GeoJSON file the app loads (public/data/places.geojson).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..", "..");
export const PLACES_OUT = resolve(ROOT, "public/data/places.geojson");

/** Faith keys the app understands. Keep in sync with src/lib/faiths.ts. */
export const FAITH_KEYS = [
  "christianity",
  "islam",
  "judaism",
  "hinduism",
  "buddhism",
  "sikhism",
  "shinto",
  "jainism",
  "bahai",
  "chinese",
  "zoroastrianism",
  "other",
];

/** "Notre-Dame de Paris" + "Paris" -> "notre-dame-de-paris-paris" */
export function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates records, gives each a unique id, and writes the GeoJSON file.
 * @param {Array<object>} records place records (see src/lib/types.ts)
 * @param {string} source short label stored in the file's metadata
 */
export function writePlaces(records, source) {
  const seen = new Set();
  const features = [];

  for (const r of records) {
    if (!FAITH_KEYS.includes(r.faith)) throw new Error(`Unknown faith "${r.faith}" for ${r.name}`);
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon) || Math.abs(r.lat) > 90 || Math.abs(r.lon) > 180) {
      throw new Error(`Bad coordinates for ${r.name}: ${r.lat}, ${r.lon}`);
    }

    // Unique, readable id: name, then name + city, then a numeric suffix.
    let id = r.id ?? slugify(r.name);
    if (seen.has(id) && r.city) id = slugify(`${r.name} ${r.city}`);
    for (let n = 2; seen.has(id); n++) id = `${slugify(r.name)}-${n}`;
    seen.add(id);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [round(r.lon), round(r.lat)] },
      properties: {
        id,
        name: r.name,
        faith: r.faith,
        tradition: r.tradition || null,
        city: r.city || null,
        country: r.country || null,
        heritage: Boolean(r.heritage),
        website: r.website || null,
        wikipedia: r.wikipedia || null,
        wikidata: r.wikidata || null,
      },
    });
  }

  const collection = {
    type: "FeatureCollection",
    metadata: { source, generatedAt: new Date().toISOString(), count: features.length },
    features,
  };

  mkdirSync(dirname(PLACES_OUT), { recursive: true });
  writeFileSync(PLACES_OUT, JSON.stringify(collection));

  // Print a per-faith summary so gaps are easy to spot.
  const byFaith = {};
  for (const f of features) byFaith[f.properties.faith] = (byFaith[f.properties.faith] ?? 0) + 1;
  console.log(`Wrote ${features.length} places to ${PLACES_OUT}`);
  console.table(byFaith);
}

const round = (n) => Math.round(n * 1e5) / 1e5; // ~1 m precision is plenty
