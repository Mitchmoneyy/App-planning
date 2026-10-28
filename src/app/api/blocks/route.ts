/**
 * GET  /api/blocks — people I've blocked (described by what I blocked them from, never their identity)
 * POST /api/blocks — { kind, id }: block whoever wrote this prayer, request or review.
 * Blocked people's prayers, requests and reviews are hidden from me, and they can't notify me.
 */
import { actorKey, getStore, senderActor } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";
import { getPlace } from "@/lib/places.server";

export const GET = handle(async () => {
  const who = await getIdentity();
  const blocks = await getStore().listBlocks(actorKey(who));
  return privateJson({ blocks: blocks.map((b) => ({ id: b.id, label: b.label, createdAt: b.createdAt })) });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  const me = actorKey(who);
  if (!rateLimit(`block:${me}`, 30, 60 * 60 * 1000)) throw new HttpError(429, "Please slow down a little.");
  const { kind, id } = await readJson<{ kind?: string; id?: string }>(req);
  if (typeof id !== "string") throw new HttpError(400, "Invalid request.");

  const store = getStore();
  let author: string | null = null;
  let label = "";
  if (kind === "world_prayer") {
    const p = await store.getWorldPrayer(id);
    if (p) [author, label] = [senderActor(p), `Someone who sent a prayer for ${p.target.name}`];
  } else if (kind === "request") {
    const r = await store.getRequest(id);
    if (r) [author, label] = [`u:${r.userId}`, `Someone who asked for prayers in ${r.area.name}`];
  } else if (kind === "church_prayer") {
    const p = await store.getPrayer(id);
    if (p) [author, label] = [senderActor(p), `Someone who prayed at ${getPlace(p.placeId)?.name ?? "a place of worship"}`];
  } else {
    throw new HttpError(400, "Invalid request.");
  }
  if (!author) throw new HttpError(404, "We couldn't find that.");
  if (author === me) throw new HttpError(400, "That's you.");

  await store.addBlock(me, author, label);
  return privateJson({ ok: true });
});
