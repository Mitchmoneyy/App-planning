// GET /api/search?q=mosques+in+istanbul&lat=&lon= — places, cities and countries.
import { handle, HttpError } from "@/server/http";
import { search } from "@/server/search";

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  if (q.trim().length < 2) throw new HttpError(400, "Type at least two letters.");
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const near = url.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  return Response.json(await search(q, near), { headers: { "Cache-Control": "public, max-age=60, s-maxage=600" } });
});
