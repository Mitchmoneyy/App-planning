// GET /api/places/:id/immersive — Street View and 360° panoramas for the "arrive there" view.
import { handle, requirePlace } from "@/server/http";
import { getMapillaryPanoramas, getStreetView } from "@/server/immersive";
import { getPlaceInfo } from "@/server/wikimedia";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/places/[id]/immersive">) => {
  const place = await requirePlace((await ctx.params).id);
  const [streetView, mapillary, info] = await Promise.all([getStreetView(place), getMapillaryPanoramas(place), getPlaceInfo(place)]);
  return Response.json(
    { streetView, panoramas: [...info.panoramas, ...mapillary] },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
});
