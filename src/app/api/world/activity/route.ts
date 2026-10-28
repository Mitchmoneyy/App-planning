/**
 * GET /api/world/activity — recent prayers for the globe's arcs and glow,
 * open public requests, and totals. Only rounded areas, never people.
 */
import { getStore } from "@/server/db";
import { getIdentity, handle, privateJson } from "@/server/http";
import { toActivity, toAreaView } from "@/server/views";
import { blockedBy } from "@/server/world";

export const GET = handle(async () => {
  const who = await getIdentity();
  const store = getStore();
  const excludeActors = await blockedBy(who);
  const [prayers, requests, stats] = await Promise.all([
    store.listWorldPrayers({ limit: 250, excludeActors }),
    store.listPublicRequests({ limit: 200, excludeActors }),
    store.worldStats(),
  ]);
  return privateJson({
    stats,
    prayers: prayers.map(toActivity),
    requests: requests.map((r) => ({ id: r.id, area: toAreaView(r.area), prayedCount: r.prayedCount })),
  });
});
