// POST /api/world/report — { kind: "world_prayer"|"request", id, reason }. Hidden after 3 reports.
import { actorKey, getStore } from "@/server/db";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const HIDE_AFTER = 3;
const REASONS = new Set(["hateful", "faith-attack", "harassment", "spam", "personal-info", "inappropriate", "other"]);

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const who = await getIdentity();
  const { kind, id, reason } = await readJson<{ kind?: string; id?: string; reason?: string }>(req);
  if ((kind !== "world_prayer" && kind !== "request") || typeof id !== "string" || !REASONS.has(reason ?? "")) {
    throw new HttpError(400, "Please choose a reason.");
  }
  if (!rateLimit(`report:${actorKey(who)}`, 20, 60 * 60 * 1000)) throw new HttpError(429, "Please slow down a little.");

  const store = getStore();
  const count = await store.addContentReport(kind, id, actorKey(who), reason!);
  if (count >= HIDE_AFTER) {
    if (kind === "world_prayer") await store.setWorldPrayerStatus(id, "hidden", `Hidden after ${count} reports`);
    else await store.updateRequest(id, { status: "hidden", moderationNote: `Hidden after ${count} reports` });
  }
  return privateJson({ ok: true });
});
