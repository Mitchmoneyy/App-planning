// GET /api/places/:id/weather — current weather at the place (MET Norway, cached 30 min).
import { handle, requirePlace } from "@/server/http";
import { getWeather } from "@/server/weather";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/places/[id]/weather">) => {
  const place = await requirePlace((await ctx.params).id);
  const weather = await getWeather(place.lat, place.lon);
  return Response.json({ weather }, { headers: { "Cache-Control": `public, s-maxage=${weather ? 1800 : 300}` } });
});
