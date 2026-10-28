/**
 * GET    /api/places/:id/reviews — published reviews, average rating, and my review
 * POST   /api/places/:id/reviews — write or update my review (signed-in users)
 * DELETE /api/places/:id/reviews — delete my review
 */
import { actorKey, getStore, type ReviewStatus } from "@/server/db";
import { requireUser } from "@/server/auth";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson, requirePlace } from "@/server/http";
import { cleanText, moderate } from "@/server/moderation";
import { rateLimit } from "@/server/rateLimit";
import { toReviewView } from "@/server/views";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/places/[id]/reviews">) => {
  const place = requirePlace((await ctx.params).id);
  const who = await getIdentity();
  const store = getStore();
  const [all, summary, mine, blocked] = await Promise.all([
    store.listReviews(place.id),
    store.getReviewSummary(place.id),
    who.userId ? store.getUserReview(place.id, who.userId) : null,
    store.blockedActors(actorKey(who)),
  ]);
  const reviews = all.filter((r) => !blocked.includes(`u:${r.userId}`));
  return privateJson({
    summary,
    reviews: reviews.map((r) => toReviewView(r, r.userId === who.userId)),
    mine: mine ? toReviewView(mine, true) : null,
  });
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/places/[id]/reviews">) => {
  assertSameOrigin(req);
  const place = requirePlace((await ctx.params).id);
  const who = await getIdentity();
  const user = await requireUser(who);
  const body = await readJson<{ rating?: unknown; text?: unknown }>(req);

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "Please choose 1 to 5 stars.");
  const text = cleanText(body.text);
  if (text.length < 10) throw new HttpError(400, "Please write at least a sentence about your visit.");
  if (text.length > 2000) throw new HttpError(400, "Please keep your review under 2,000 characters.");
  if (!rateLimit(`review:${user.id}`, 10, 60 * 60 * 1000)) throw new HttpError(429, "Please wait a little before editing again.");

  const verdict = await moderate(text, "review");
  if (verdict.decision === "reject") {
    return privateJson({ ok: false, status: "rejected", message: verdict.message }, { status: 422 });
  }
  const status: ReviewStatus = verdict.decision === "approve" ? "published" : "pending";

  const review = await getStore().upsertReview({
    placeId: place.id,
    userId: user.id,
    displayName: user.displayName,
    rating,
    body: text,
    status,
    moderationNote: verdict.note,
  });
  return privateJson({
    ok: true,
    status,
    message: status === "published" ? "Thank you. Your review is published." : verdict.message,
    review: toReviewView(review, true),
  });
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/places/[id]/reviews">) => {
  assertSameOrigin(req);
  const place = requirePlace((await ctx.params).id);
  const user = await requireUser(await getIdentity());
  await getStore().deleteReview(place.id, user.id);
  return privateJson({ ok: true });
});
