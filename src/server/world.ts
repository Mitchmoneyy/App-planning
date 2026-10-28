/**
 * Sending a prayer or blessing to a place (or to someone's prayer request),
 * and letting the people there know. Shared by the API routes.
 */
import "server-only";
import { after } from "next/server";
import { blessingText, isFaithOption } from "@/lib/blessings";
import { countryName } from "@/lib/cities";
import { actorKey, getStore, senderActor, type AreaRef, type Identity, type PrayerRequestRecord, type WorldPrayerRecord } from "./db";
import { resolveArea } from "./geo";
import { HttpError } from "./http";
import { cleanText, moderate, type ModerationResult } from "./moderation";
import { notify } from "./notify";

const AREA_NOTICE_GAP_MS = 6 * 60 * 60 * 1000; // at most one "your city" notice per 6 h

export interface SendInput {
  text?: unknown;
  templateId?: unknown;
  anonymous?: unknown;
  name?: unknown;
  faith?: unknown;
  showFaith?: unknown;
  target?: unknown;
  origin?: unknown;
}

/** Validates and moderates a prayer; returns the record to save (not saved yet). */
export async function prepareWorldPrayer(
  input: SendInput,
  who: Identity,
  fixedTarget?: AreaRef,
): Promise<{ prayer: Omit<WorldPrayerRecord, "id" | "reportCount" | "createdAt">; verdict: ModerationResult | null }> {
  const target = fixedTarget ?? resolveArea(input.target)!;
  const origin = resolveArea(input.origin, { required: false });
  const placeName = target.kind === "city" ? target.name : countryName(target.cc);

  const templateId = typeof input.templateId === "string" ? input.templateId : null;
  const template = templateId ? blessingText(templateId, placeName) : null;
  const custom = cleanText(input.text);
  if (custom.length > 600) throw new HttpError(400, "Please keep your prayer under 600 characters.");
  const body = custom || template;
  if (!body) throw new HttpError(400, "Please write a prayer or choose a blessing.");

  const anonymous = input.anonymous !== false;
  const name = cleanText(input.name).slice(0, 40) || null;
  if (!anonymous && !name) throw new HttpError(400, "Please add a name, or send anonymously.");
  const faith = isFaithOption(input.faith) ? input.faith : null;

  // Templates are pre-approved; anything the person wrote is checked.
  const verdict = custom ? await moderate(custom, "world-prayer") : null;
  if (verdict?.decision === "reject") throw new HttpError(422, verdict.message ?? "This can't be shared.");

  return {
    verdict,
    prayer: {
      senderDevice: who.deviceId,
      senderUser: who.userId,
      body,
      templateId: custom ? null : templateId,
      faith,
      showFaith: Boolean(faith && input.showFaith === true),
      anonymous,
      displayName: anonymous ? null : name,
      target,
      origin,
      requestId: null,
      status: !verdict || verdict.decision === "approve" ? "published" : "pending",
      moderationNote: verdict?.note ?? null,
    },
  };
}

/** "Someone in Brazil" / "Someone in São Paulo, Brazil" / "Someone" */
export const fromWhere = (p: Pick<WorldPrayerRecord, "origin">) =>
  p.origin ? `Someone in ${p.origin.kind === "city" ? `${p.origin.name}, ${countryName(p.origin.cc)}` : countryName(p.origin.cc)}` : "Someone";

/** After a prayer for a city is published: let people who live there know (if they asked). */
export function notifyArea(prayer: WorldPrayerRecord) {
  if (prayer.status !== "published" || prayer.target.cityId === null) return;
  after(async () => {
    const store = getStore();
    const watchers = await store.usersWatchingCity(prayer.target.cityId!);
    for (const s of watchers) {
      if (s.userId === prayer.senderUser) continue;
      if (s.lastAreaNoticeAt && Date.now() - Date.parse(s.lastAreaNoticeAt) < AREA_NOTICE_GAP_MS) continue;
      if (await store.isBlocked(`u:${s.userId}`, [senderActor(prayer)])) continue;
      await store.saveSettings({ ...s, lastAreaNoticeAt: new Date().toISOString() });
      await notify(s.userId, {
        kind: "area_prayer",
        title: `${fromWhere(prayer)} is praying for ${prayer.target.name}`,
        body: prayer.body.slice(0, 160),
        link: "/area",
      });
    }
  });
}

/** After someone prays for a request: let its author know, unless they blocked the sender. */
export function notifyRequestOwner(request: PrayerRequestRecord, prayer: WorldPrayerRecord) {
  after(async () => {
    const store = getStore();
    if (request.userId === prayer.senderUser) return;
    const settings = await store.getSettings(request.userId);
    if (!settings.notifyRequests) return;
    if (await store.isBlocked(`u:${request.userId}`, [senderActor(prayer)])) return;
    await notify(request.userId, {
      kind: "request_prayed",
      title: `${fromWhere(prayer)} prayed for you`,
      body: prayer.status === "published" ? prayer.body.slice(0, 160) : "Someone is holding you in their prayers.",
      link: `/world/requests/${request.id}`,
    });
  });
}

/** Actors this person has blocked (for filtering lists). */
export const blockedBy = (who: Identity) => getStore().blockedActors(actorKey(who));
