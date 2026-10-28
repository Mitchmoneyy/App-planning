// DELETE /api/prayers/:prayerId — the author removes one of their prayers.
import { getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson } from "@/server/http";
import { ownsPrayer } from "@/server/views";

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/prayers/[prayerId]">) => {
  assertSameOrigin(req);
  const { prayerId } = await ctx.params;
  const who = await getIdentity();
  const store = getStore();
  const prayer = await store.getPrayer(prayerId);
  if (!prayer || !ownsPrayer(prayer, who)) throw new HttpError(404, "Prayer not found.");
  await store.deletePrayer(prayerId);
  return privateJson({ ok: true });
});
