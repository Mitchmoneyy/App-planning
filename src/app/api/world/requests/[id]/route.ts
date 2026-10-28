/**
 * GET    /api/world/requests/:id — a request and the prayers sent for it
 * PATCH  /api/world/requests/:id — author: { closed?, visibility? }
 * DELETE /api/world/requests/:id — author removes it
 */
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { ownsWorldPrayer, toRequestView, toWorldPrayerView } from "@/server/views";
import { blockedBy } from "@/server/world";

async function load(ctx: RouteContext<"/api/world/requests/[id]">) {
  const { id } = await ctx.params;
  const request = await getStore().getRequest(id);
  return request;
}

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/world/requests/[id]">) => {
  const who = await getIdentity();
  const request = await load(ctx);
  const mine = request?.userId === who.userId && who.userId !== null;
  // Unlisted requests are viewable by link; pending/hidden ones only by their author.
  if (!request || (request.status !== "published" && !mine)) throw new HttpError(404, "This prayer request isn't available.");

  const store = getStore();
  const excludeActors = await blockedBy(who);
  const [prayers, prayed] = await Promise.all([
    store.listWorldPrayers({ limit: 100, requestId: request.id, excludeActors }),
    store.prayedForRequests([request.id], actorKey(who)),
  ]);
  return privateJson({
    request: toRequestView(request, { prayedByMe: prayed.has(request.id), mine }),
    prayers: prayers.map((p) => toWorldPrayerView(p, ownsWorldPrayer(p, who))),
  });
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/world/requests/[id]">) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  const request = await load(ctx);
  if (!request || request.userId !== who.userId) throw new HttpError(404, "Prayer request not found.");
  const body = await readJson<{ closed?: unknown; visibility?: unknown }>(req);
  await getStore().updateRequest(request.id, {
    ...(typeof body.closed === "boolean" ? { closed: body.closed } : {}),
    ...(body.visibility === "public" || body.visibility === "unlisted" ? { visibility: body.visibility } : {}),
  });
  return privateJson({ ok: true });
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/world/requests/[id]">) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  const request = await load(ctx);
  if (!request || request.userId !== who.userId) throw new HttpError(404, "Prayer request not found.");
  await getStore().deleteRequest(request.id);
  return privateJson({ ok: true });
});
