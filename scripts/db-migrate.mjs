// Applies db/schema.sql to the database in DATABASE_URL. Safe to re-run.
//
//   npm run db:migrate

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { ROOT } from "./lib/places-output.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first (in .env.local or your shell).");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(resolve(ROOT, "db/schema.sql"), "utf8"));
  console.log("Database schema is up to date.");
} finally {
  await sql.end();
}
