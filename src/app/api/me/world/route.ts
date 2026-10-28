/**
 * GET /api/me/world — prayers I've sent to places, my prayer requests, and the
 * prayers others sent for them ("received").
 */
import { getStore } from "@/server/db";
import { getIdentity, handle, privateJson } from "@/server/http";
import { toRequestView, toWorldPrayerView } from "@/server/views";
import { blockedBy } from "@/server/world";

export const GET = handle(async () => {
  const who = await getIdentity();
  const store = getStore();
  const sent = await store.listOwnWorldPrayers(who);
  const requests = who.userId ? await store.listOwnRequests(who.userId) : [];
  const excludeActors = await blockedBy(who);
  const received = (
    await Promise.all(requests.map((r) => store.listWorldPrayers({ limit: 50, requestId: r.id, excludeActors })))
  ).flat();

  return privateJson({
    sent: sent.filter((p) => p.status !== "rejected").map((p) => ({ ...toWorldPrayerView(p, true), status: p.status })),
    requests: requests.filter((r) => r.status !== "rejected").map((r) => toRequestView(r, { prayedByMe: false, mine: true })),
    received: received
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => toWorldPrayerView(p, false)),
  });
});
