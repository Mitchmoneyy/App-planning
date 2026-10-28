// GET /api/places/:id/info — history, facts and photos from Wikipedia/Wikidata/Commons.
import { handle, requirePlace } from "@/server/http";
import { getPlaceInfo } from "@/server/wikimedia";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/places/[id]/info">) => {
  const place = await requirePlace((await ctx.params).id);
  const info = await getPlaceInfo(place);
  return Response.json(info, {
    headers: {
      // Same for everyone: let the CDN cache it (a day, then refresh in the background).
      "Cache-Control": info.available ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300",
    },
  });
});
