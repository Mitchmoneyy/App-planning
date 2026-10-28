/**
 * PUT    /api/me/favorites/:placeId — save a place
 * DELETE /api/me/favorites/:placeId — unsave it
 * Works without an account (saved to this device; moved to the account on sign-in).
 */
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, requirePlace } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

async function setFavorite(req: Request, ctx: RouteContext<"/api/me/favorites/[placeId]">, on: boolean) {
  assertSameOrigin(req);
  const place = await requirePlace((await ctx.params).placeId);
  const who = await getIdentity();
  if (!rateLimit(`fav:${actorKey(who)}`, 120, 60 * 60 * 1000)) throw new HttpError(429, "Please slow down a little.");
  await getStore().setFavorite(actorKey(who), place.id, on);
  return privateJson({ ok: true, favorite: on });
}

export const PUT = handle((req: Request, ctx: RouteContext<"/api/me/favorites/[placeId]">) => setFavorite(req, ctx, true));
export const DELETE = handle((req: Request, ctx: RouteContext<"/api/me/favorites/[placeId]">) => setFavorite(req, ctx, false));
