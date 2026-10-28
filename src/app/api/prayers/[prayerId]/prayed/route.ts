// POST /api/prayers/:prayerId/prayed — "I prayed for this" (once per person).
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/prayers/[prayerId]/prayed">) => {
  assertSameOrigin(req);
  const { prayerId } = await ctx.params;
  const who = await getIdentity();
  const store = getStore();

  const prayer = await store.getPrayer(prayerId);
  if (!prayer || prayer.status !== "published") throw new HttpError(404, "This prayer is no longer on the wall.");
  if (!rateLimit(`prayed:${actorKey(who)}`, 120, 60 * 60 * 1000)) throw new HttpError(429, "Please slow down a little.");

  await store.addPrayedFor(prayerId, actorKey(who));
  const updated = await store.getPrayer(prayerId);
  return privateJson({ prayedCount: updated?.prayedCount ?? prayer.prayedCount, prayedByMe: true });
});
