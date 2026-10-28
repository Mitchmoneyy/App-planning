// POST /api/admin/moderate — { kind: "prayer"|"review", id, action: "approve"|"remove" }.
import { getStore } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { assertSameOrigin, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(await getIdentity());
  const { kind, id, action } = await readJson<{ kind?: string; id?: string; action?: string }>(req);
  if (typeof id !== "string" || !["approve", "remove"].includes(action ?? "")) throw new HttpError(400, "Invalid request.");

  const store = getStore();
  const note = `${action === "approve" ? "Approved" : "Removed"} by ${admin.displayName}`;
  if (kind === "prayer") await store.setPrayerStatus(id, action === "approve" ? "published" : "rejected", note);
  else if (kind === "review") await store.setReviewStatus(id, action === "approve" ? "published" : "rejected", note);
  else throw new HttpError(400, "Invalid request.");
  return privateJson({ ok: true });
});
