// GET /api/places/lookup?ids=a,b,c — basic details for a few places (saved lists, history).
import { handle, HttpError } from "@/server/http";
import { findPlace } from "@/lib/places.server";

export const GET = handle(async (req: Request) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  if (!ids.length) throw new HttpError(400, "No places requested.");
  const found = await Promise.all(ids.map((id) => findPlace(id)));
  const places = found
    .filter((p) => p !== null)
    .map(({ id, name, faith, tradition, city, country, lat, lon }) => ({ id, name, faith, tradition, city, country, lat, lon }));
  return Response.json({ places }, { headers: { "Cache-Control": "public, max-age=300" } });
});
