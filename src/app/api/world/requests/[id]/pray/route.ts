/**
 * POST /api/world/requests/:id/pray — pray for someone's request.
 * Optional short message or blessing; the author is notified (unless they blocked you).
 */
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { toWorldPrayerView } from "@/server/views";
import { notifyRequestOwner, prepareWorldPrayer, type SendInput } from "@/server/world";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/world/requests/[id]/pray">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const who = await getIdentity();
  const store = getStore();
  const request = await store.getRequest(id);
  if (!request || request.status !== "published" || request.closed) throw new HttpError(404, "This request is no longer open.");
  if (request.userId === who.userId) throw new HttpError(400, "This is your own request.");
  if (!rateLimit(`world:${actorKey(who)}`, 10, 10 * 60 * 1000) || !rateLimit(`world-ip:${clientIp(req)}`, 60, 60 * 60 * 1000)) {
    throw new HttpError(429, "You've sent many prayers just now. Please rest a moment.");
  }

  const input = await readJson<SendInput>(req);
  // "I prayed for this" with no words is fine: use a gentle default blessing.
  if (!input.text && !input.templateId) input.templateId = "peace";

  // Check the words first, so a rejected message doesn't count as a prayer.
  const { prayer, verdict } = await prepareWorldPrayer(input, who, request.area);
  const firstTime = await store.addRequestPrayer(request.id, actorKey(who));
  if (!firstTime) {
    const fresh = await store.getRequest(request.id);
    return privateJson({ ok: true, already: true, prayedCount: fresh?.prayedCount ?? request.prayedCount });
  }
  const saved = await store.createWorldPrayer({ ...prayer, requestId: request.id });
  notifyRequestOwner(request, saved);

  const fresh = await store.getRequest(request.id);
  return privateJson({
    ok: true,
    status: saved.status,
    prayedCount: fresh?.prayedCount ?? request.prayedCount + 1,
    message: saved.status === "published" ? "Thank you. They'll know someone prayed for them." : verdict?.message,
    prayer: toWorldPrayerView(saved, true),
  });
});
