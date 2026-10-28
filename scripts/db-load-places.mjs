// Loads the pipeline's places.ndjson.gz into Postgres (db/places.sql).
//   node --env-file=.env.local scripts/db-load-places.mjs pipeline/out/world/places.ndjson.gz
// Upserts in batches, so re-running after a pipeline refresh updates in place.
import fs from "node:fs";
import readline from "node:readline";
import zlib from "node:zlib";
import postgres from "postgres";

const file = process.argv[2] ?? "pipeline/out/world/places.ndjson.gz";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
await sql.file("db/places.sql");

const BATCH = 2000;
let batch = [];
let n = 0;
const flush = async () => {
  if (!batch.length) return;
  await sql`
    insert into places ${sql(batch, "id", "name", "faith", "tradition", "address", "city", "region", "postcode", "cc", "country", "website", "wikidata", "wikipedia", "heritage", "landmark", "height", "geom", "footprint", "sources", "source_ids")}
    on conflict (id) do update set
      name = excluded.name, faith = excluded.faith, tradition = excluded.tradition, address = excluded.address,
      city = excluded.city, region = excluded.region, postcode = excluded.postcode, cc = excluded.cc, country = excluded.country,
      website = excluded.website, wikidata = excluded.wikidata, wikipedia = excluded.wikipedia, heritage = excluded.heritage,
      landmark = excluded.landmark, height = excluded.height, geom = excluded.geom, footprint = excluded.footprint,
      sources = excluded.sources, source_ids = excluded.source_ids, updated_at = now()`;
  n += batch.length;
  batch = [];
  process.stdout.write(`\r${n.toLocaleString()} places`);
};

const input = fs.createReadStream(file).pipe(zlib.createGunzip());
for await (const line of readline.createInterface({ input })) {
  if (!line) continue;
  const p = JSON.parse(line);
  batch.push({
    id: p.id, name: p.name, faith: p.faith, tradition: p.tradition ?? null, address: p.address ?? null, city: p.city ?? null,
    region: p.region ?? null, postcode: p.postcode ?? null, cc: p.cc ?? null, country: p.country ?? null, website: p.website ?? null,
    wikidata: p.wikidata ?? null, wikipedia: p.wikipedia ?? null, heritage: !!p.heritage, landmark: !!p.landmark, height: p.height ?? null,
    geom: `SRID=4326;POINT(${p.lon} ${p.lat})`,
    footprint: p.footprint ? sql.json(p.footprint) : null,
    sources: p.sources ?? [], source_ids: p.sourceIds ?? [],
  });
  if (batch.length >= BATCH) await flush();
}
await flush();
console.log(`\nDone: ${n.toLocaleString()} places.`);
await sql.end();
