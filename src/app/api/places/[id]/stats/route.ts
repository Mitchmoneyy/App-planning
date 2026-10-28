// GET /api/places/:id/stats — live candle and prayer counts.
import { getStore } from "@/server/db";
import { handle, requirePlace } from "@/server/http";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/places/[id]/stats">) => {
  const place = requirePlace((await ctx.params).id);
  const stats = await getStore().getPlaceStats(place.id);
  return Response.json(stats, { headers: { "Cache-Control": "public, s-maxage=5" } });
});
