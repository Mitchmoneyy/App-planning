/**
 * GET  /api/world/requests?cc=…&before=… — open public prayer requests
 * POST /api/world/requests — ask others to pray for you (account required, tied to your home area)
 */
import { isFaithOption } from "@/lib/blessings";
import { actorKey, getStore } from "@/server/db";
import { requireUser } from "@/server/auth";
import { resolveArea } from "@/server/geo";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { cleanText, moderate } from "@/server/moderation";
import { rateLimit } from "@/server/rateLimit";
import { toRequestView } from "@/server/views";
import { blockedBy } from "@/server/world";

const PAGE = 30;

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const cc = url.searchParams.get("cc");
  const before = url.searchParams.get("before") ?? undefined;
  if (before && Number.isNaN(Date.parse(before))) throw new HttpError(400, "Invalid cursor.");

  const who = await getIdentity();
  const store = getStore();
  const requests = await store.listPublicRequests({
    limit: PAGE,
    before,
    cc: cc && /^[A-Z]{2}$/i.test(cc) ? cc.toUpperCase() : undefined,
    excludeActors: await blockedBy(who),
  });
  const prayed = await store.prayedForRequests(
    requests.map((r) => r.id),
    actorKey(who),
  );
  return privateJson({
    requests: requests.map((r) => toRequestView(r, { prayedByMe: prayed.has(r.id), mine: r.userId === who.userId })),
    nextCursor: requests.length === PAGE ? requests[requests.length - 1].createdAt : null,
  });
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  const user = await requireUser(who);
  if (!rateLimit(`request:${user.id}`, 5, 24 * 60 * 60 * 1000)) {
    throw new HttpError(429, "You can share up to 5 prayer requests a day.");
  }

  const body = await readJson<{ text?: unknown; area?: unknown; visibility?: unknown; anonymous?: unknown; faith?: unknown; showFaith?: unknown }>(req);
  const text = cleanText(body.text);
  if (text.length < 10) throw new HttpError(400, "Please share a little about what you'd like prayers for.");
  if (text.length > 800) throw new HttpError(400, "Please keep your request under 800 characters.");

  // The request is tied to the person's own area: their saved home, or a city/country they choose.
  const settings = await getStore().getSettings(user.id);
  const area = resolveArea(body.area, { required: false }) ?? settings.home;
  if (!area) throw new HttpError(400, "Please choose your city or country first.");

  const verdict = await moderate(text, "prayer-request");
  if (verdict.decision === "reject") {
    return privateJson({ ok: false, status: "rejected", message: verdict.message, selfHarm: verdict.selfHarm }, { status: 422 });
  }

  const faith = isFaithOption(body.faith) ? body.faith : null;
  const request = await getStore().createRequest({
    userId: user.id,
    body: text,
    faith,
    showFaith: Boolean(faith && body.showFaith === true),
    anonymous: body.anonymous !== false,
    displayName: user.displayName,
    area,
    visibility: body.visibility === "unlisted" ? "unlisted" : "public",
    status: verdict.decision === "approve" ? "published" : "pending",
    moderationNote: verdict.note,
  });

  return privateJson(
    {
      ok: true,
      status: request.status,
      message:
        request.status === "published"
          ? "Your request is shared. We'll let you know when someone prays for you."
          : (verdict.message ?? "Thank you. Your request will appear after a quick review."),
      selfHarm: verdict.selfHarm,
      request: toRequestView(request, { prayedByMe: false, mine: true }),
    },
    { status: 201 },
  );
});
