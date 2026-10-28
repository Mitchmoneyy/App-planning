// POST /api/places/:id/candles — make a devotional gesture (candle, diya, dua, incense, …; one every few minutes per person).
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, readJson, requirePlace } from "@/server/http";
import { gesturesFor, isGestureKind } from "@/lib/gestures";
import { rateLimit } from "@/server/rateLimit";

const COOLDOWN_MS = 5 * 60 * 1000;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/places/[id]/candles">) => {
  assertSameOrigin(req);
  const place = await requirePlace((await ctx.params).id);
  const who = await getIdentity();
  const store = getStore();
  const actor = actorKey(who);
  const body = await readJson<{ kind?: unknown }>(req);
  // Only gestures that belong to this place's tradition (no candles at a mosque).
  const allowed = gesturesFor(place.faith, place.tradition).map((g) => g.kind);
  const kind = isGestureKind(body.kind) && allowed.includes(body.kind) ? body.kind : allowed[0];

  if (!rateLimit(`candle-ip:${clientIp(req)}`, 30, 60 * 60 * 1000)) {
    throw new HttpError(429, "Many prayers have been offered from here. Please rest a while and return.");
  }

  const last = await store.lastCandleAt(place.id, actor);
  const lit = !last || Date.now() - last.getTime() > COOLDOWN_MS;
  if (lit) await store.lightCandle(place.id, actor, kind);

  // Already lit recently: not an error, the candle is still burning.
  return privateJson({ lit, kind, stats: await store.getPlaceStats(place.id) });
});
