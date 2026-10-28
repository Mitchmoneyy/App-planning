/**
 * GET  /api/places/:id/prayers?before=<iso>  — the public prayer wall
 * POST /api/places/:id/prayers               — offer a prayer (public or private)
 */
import { actorKey, getStore, senderActor, type PrayerStatus } from "@/server/db";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, readJson, requirePlace } from "@/server/http";
import { cleanText, moderate } from "@/server/moderation";
import { rateLimit } from "@/server/rateLimit";
import { sealText } from "@/server/security";
import { ownsPrayer, toWallPrayer } from "@/server/views";
import type { SubmitResult } from "@/lib/apiTypes";

const PAGE_SIZE = 20;
const MAX_LENGTH = 1000;

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/places/[id]/prayers">) => {
  const place = requirePlace((await ctx.params).id);
  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  if (before && Number.isNaN(Date.parse(before))) throw new HttpError(400, "Invalid cursor.");

  const who = await getIdentity();
  const store = getStore();
  const page = await store.listPublicPrayers(place.id, PAGE_SIZE, before);
  const blocked = new Set(await store.blockedActors(actorKey(who)));
  const prayers = page.filter((p) => !blocked.has(senderActor(p)));
  const prayed = await store.prayedForSet(
    prayers.map((p) => p.id),
    actorKey(who),
  );

  return privateJson({
    prayers: prayers.map((p) => toWallPrayer(p, prayed.has(p.id), ownsPrayer(p, who))),
    nextCursor: page.length === PAGE_SIZE ? page[page.length - 1].createdAt : null,
  });
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/places/[id]/prayers">) => {
  assertSameOrigin(req);
  const place = requirePlace((await ctx.params).id);
  const who = await getIdentity();
  const body = await readJson<{ text?: unknown; isPublic?: unknown; anonymous?: unknown; name?: unknown }>(req);

  const text = cleanText(body.text);
  if (text.length < 2) throw new HttpError(400, "Please write a few words.");
  if (text.length > MAX_LENGTH) throw new HttpError(400, `Please keep your prayer under ${MAX_LENGTH} characters.`);
  const isPublic = body.isPublic === true;
  const anonymous = body.anonymous !== false;
  const name = cleanText(body.name).slice(0, 40) || null;
  if (isPublic && !anonymous && !name) throw new HttpError(400, "Please add a name, or post anonymously.");

  const actor = actorKey(who);
  if (!rateLimit(`prayer:${actor}`, 6, 10 * 60 * 1000) || !rateLimit(`prayer-ip:${clientIp(req)}`, 30, 60 * 60 * 1000)) {
    throw new HttpError(429, "You've shared several prayers just now. Please wait a few minutes before offering another.");
  }

  let status: PrayerStatus = "private";
  let note: string | null = null;
  let result: SubmitResult = { ok: true, status: "private", message: "Your prayer has been offered. Only you can see it." };

  if (isPublic) {
    const verdict = await moderate(text, "prayer");
    note = verdict.note;
    if (verdict.decision === "reject") {
      // Not saved at all, so the author can edit and try again.
      return privateJson({ ok: false, status: "rejected", message: verdict.message, selfHarm: verdict.selfHarm } satisfies SubmitResult, {
        status: 422,
      });
    }
    status = verdict.decision === "approve" ? "published" : "pending";
    result = {
      ok: true,
      status,
      message: status === "published" ? "Your prayer is on the wall. Others can now pray with you." : verdict.message,
      selfHarm: verdict.selfHarm,
    };
  }

  await getStore().createPrayer({
    placeId: place.id,
    ownerDevice: who.deviceId,
    ownerUser: who.userId,
    body: isPublic ? text : sealText(text),
    isPublic,
    anonymous: isPublic ? anonymous : true,
    displayName: isPublic && !anonymous ? name : null,
    status,
    moderationNote: note,
  });

  return privateJson(result, { status: 201 });
});
