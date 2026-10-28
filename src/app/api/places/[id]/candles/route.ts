// POST /api/places/:id/candles — light a virtual candle (one every few minutes per person).
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, requirePlace } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const COOLDOWN_MS = 5 * 60 * 1000;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/places/[id]/candles">) => {
  assertSameOrigin(req);
  const place = requirePlace((await ctx.params).id);
  const who = await getIdentity();
  const store = getStore();
  const actor = actorKey(who);

  if (!rateLimit(`candle-ip:${clientIp(req)}`, 30, 60 * 60 * 1000)) {
    throw new HttpError(429, "Many candles have been lit from here. Please rest a while and return.");
  }

  const last = await store.lastCandleAt(place.id, actor);
  const lit = !last || Date.now() - last.getTime() > COOLDOWN_MS;
  if (lit) await store.lightCandle(place.id, actor);

  // Already lit recently: not an error, the candle is still burning.
  return privateJson({ lit, stats: await store.getPlaceStats(place.id) });
});
