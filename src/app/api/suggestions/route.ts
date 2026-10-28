// POST /api/suggestions — suggest a new place, a correction, a closure or a duplicate.
// Everything goes to the moderation queue; nothing changes on the map until a moderator approves.
import { z } from "zod";
import { getStore } from "@/server/db";
import { assertSameOrigin, clientIp, getIdentity, handle, HttpError, privateJson, readJson } from "@/server/http";
import { cleanText, localCheck } from "@/server/moderation";
import { rateLimit } from "@/server/rateLimit";
import { FAITHS } from "@/lib/faiths";
import { findPlace } from "@/lib/places.server";

const text = (max: number) => z.string().max(max).transform(cleanText).optional().nullable();
const Body = z.object({
  kind: z.enum(["new", "correction", "closed", "duplicate"]),
  placeId: z.string().max(80).optional().nullable(),
  name: text(140),
  faith: z.enum(FAITHS.map((f) => f.key) as [string, ...string[]]).optional().nullable(),
  tradition: text(80),
  address: text(240),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  website: z.string().max(300).url().optional().nullable().or(z.literal("")),
  note: text(1000),
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  if (!rateLimit(`suggest:${clientIp(req)}`, 20, 60 * 60 * 1000)) throw new HttpError(429, "Thank you for all your suggestions! Please try again a little later.");
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Please check the form and try again.");
  const b = parsed.data;

  if (b.kind === "new") {
    if (!b.name || b.lat == null || b.lon == null || !b.faith) throw new HttpError(400, "Please give the name, faith and location of the place.");
  } else {
    if (!b.placeId || !(await findPlace(b.placeId))) throw new HttpError(400, "We couldn't find that place.");
    if (b.kind === "correction" && !b.note && !b.name && !b.address && !b.website && !b.tradition) throw new HttpError(400, "Please tell us what to correct.");
  }
  for (const t of [b.name, b.note, b.tradition, b.address]) {
    if (!t) continue;
    const check = localCheck(t);
    if (check.decision === "reject" && check.note !== "link") throw new HttpError(400, check.message ?? "Please revise your suggestion.");
  }

  const who = await getIdentity();
  await getStore().createSuggestion({
    kind: b.kind,
    placeId: b.placeId ?? null,
    name: b.name || null,
    faith: b.faith ?? null,
    tradition: b.tradition || null,
    address: b.address || null,
    lat: b.lat ?? null,
    lon: b.lon ?? null,
    website: b.website || null,
    note: b.note || null,
    ownerUser: who.userId,
    ownerDevice: who.deviceId,
  });
  return privateJson({ ok: true, message: "Thank you! A moderator will review your suggestion, usually within a few days." });
});
