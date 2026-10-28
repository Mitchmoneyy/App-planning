// GET /api/tiles/places/{z}/{x}/{y} — places of worship as vector tiles (Mapbox Vector Tile format).
import { connection } from "next/server";
import { getPlacesTile } from "@/server/tiles";

const MAX_ZOOM = 12;

export async function GET(_req: Request, ctx: RouteContext<"/api/tiles/places/[z]/[x]/[y]">) {
  await connection();
  const { z, x, y } = await ctx.params;
  const [zi, xi, yi] = [z, x, y].map((v) => Number.parseInt(v, 10));
  const n = 2 ** zi;
  if (![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > MAX_ZOOM || xi < 0 || yi < 0 || xi >= n || yi >= n) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const data = await getPlacesTile(zi, xi, yi);
    return new Response(data ? Buffer.from(data) : null, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        // Tiles change only when the pipeline re-runs (monthly).
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    console.error("tile error", err);
    return new Response("Tiles unavailable", { status: 503 });
  }
}
