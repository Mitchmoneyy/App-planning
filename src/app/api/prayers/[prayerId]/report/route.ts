// POST /api/prayers/:prayerId/report — flag a prayer. Hidden automatically after several reports.
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { cleanText } from "@/server/moderation";
import { rateLimit } from "@/server/rateLimit";

/** Reports from this many different people hide a prayer until a moderator looks. */
const HIDE_AFTER = 3;
const REASONS = new Set(["hateful", "harassment", "spam", "personal-info", "inappropriate", "other"]);

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/prayers/[prayerId]/report">) => {
  assertSameOrigin(req);
  const { prayerId } = await ctx.params;
  const who = await getIdentity();
  const body = await readJson<{ reason?: unknown }>(req);
  const reason = cleanText(body.reason);
  if (!REASONS.has(reason)) throw new HttpError(400, "Please choose a reason.");
  if (!rateLimit(`report:${actorKey(who)}`, 20, 60 * 60 * 1000)) throw new HttpError(429, "Please slow down a little.");

  const store = getStore();
  const prayer = await store.getPrayer(prayerId);
  if (!prayer || prayer.status !== "published") return privateJson({ ok: true }); // already gone

  const count = await store.addReport(prayerId, actorKey(who), reason);
  if (count >= HIDE_AFTER) await store.setPrayerStatus(prayerId, "hidden", `Hidden after ${count} reports`);
  return privateJson({ ok: true });
});
