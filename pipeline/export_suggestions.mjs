// Exports approved place suggestions from Postgres for the next pipeline run.
//   node --env-file=.env.local pipeline/export_suggestions.mjs pipeline/in/suggestions.ndjson
import fs from "node:fs";
import postgres from "postgres";

const out = process.argv[2] ?? "pipeline/in/suggestions.ndjson";
if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set: no suggestions to export.");
  process.exit(0);
}
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const rows = await sql`
  select id, kind, place_id as "placeId", name, faith, tradition, address, lat, lon, website
  from place_suggestions where status = 'approved' order by reviewed_at`;
fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
console.log(`${rows.length} approved suggestions -> ${out}`);
await sql.end();
