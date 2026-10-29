// GET /api/app-config — public settings the phone app needs (so they're set once, in Vercel).
// Only public values: the Mapbox token here is the same pk. token the website sends to every browser.
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json(
    { mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
