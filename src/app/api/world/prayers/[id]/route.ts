// DELETE /api/world/prayers/:id — the sender removes a prayer they sent.
import { getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson } from "@/server/http";
import { ownsWorldPrayer } from "@/server/views";

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/world/prayers/[id]">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const who = await getIdentity();
  const store = getStore();
  const prayer = await store.getWorldPrayer(id);
  if (!prayer || !ownsWorldPrayer(prayer, who)) throw new HttpError(404, "Prayer not found.");
  await store.setWorldPrayerStatus(id, "rejected", "Removed by sender");
  return privateJson({ ok: true });
});
