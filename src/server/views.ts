/** Shapes records into what the browser is allowed to see. */
import "server-only";
import type { AreaRef, PrayerRecord, PrayerRequestRecord, ReviewRecord, WorldPrayerRecord } from "./db";
import { countryName } from "@/lib/cities";
import { faithOptionLabel } from "@/lib/blessings";
import { openText } from "./security";
import { getPlace } from "@/lib/places.server";
import type { ActivityItem, AreaView, OwnPrayer, RequestView, ReviewView, WallPrayer, WorldPrayerView } from "@/lib/apiTypes";

/** Public wall entry: no owner ids, name only if not anonymous. */
export const toWallPrayer = (p: PrayerRecord, prayedByMe: boolean, mine: boolean): WallPrayer => ({
  id: p.id,
  body: p.body,
  name: p.anonymous ? null : p.displayName,
  createdAt: p.createdAt,
  prayedCount: p.prayedCount,
  prayedByMe,
  mine,
});

const STATUS_LABEL: Record<PrayerRecord["status"], string> = {
  published: "On the prayer wall",
  private: "Private",
  pending: "Waiting for review",
  rejected: "Not shared publicly",
  hidden: "Removed from the wall",
};

/** The author's own view, including private prayers (decrypted). */
export const toOwnPrayer = (p: PrayerRecord): OwnPrayer => ({
  id: p.id,
  placeId: p.placeId,
  placeName: getPlace(p.placeId)?.name ?? "Unknown place",
  body: openText(p.body),
  isPublic: p.isPublic,
  status: p.status,
  statusLabel: STATUS_LABEL[p.status],
  createdAt: p.createdAt,
  prayedCount: p.prayedCount,
});

export const toReviewView = (r: ReviewRecord, mine: boolean): ReviewView => ({
  id: r.id,
  name: r.displayName,
  rating: r.rating,
  body: r.body,
  status: r.status,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  mine,
});

/** Owner of a prayer = signed-in author, or the same device for anonymous ones. */
export const ownsPrayer = (p: PrayerRecord, who: { deviceId: string; userId: string | null }) =>
  (who.userId !== null && p.ownerUser === who.userId) || (!p.ownerUser && p.ownerDevice === who.deviceId);

export const toAreaView = (a: AreaRef): AreaView => ({
  kind: a.kind,
  name: a.name,
  country: countryName(a.cc),
  cc: a.cc,
  cityId: a.cityId,
  lat: a.lat,
  lon: a.lon,
});

const areaText = (a: AreaRef) => (a.kind === "city" ? `${a.name}, ${countryName(a.cc)}` : countryName(a.cc));

export const toWorldPrayerView = (p: WorldPrayerRecord, mine: boolean): WorldPrayerView => ({
  id: p.id,
  body: p.body,
  name: p.anonymous ? null : p.displayName,
  faith: p.showFaith ? faithOptionLabel(p.faith) : null,
  target: toAreaView(p.target),
  origin: p.origin ? toAreaView(p.origin) : null,
  requestId: p.requestId,
  createdAt: p.createdAt,
  mine,
});

export const toActivity = (p: WorldPrayerRecord): ActivityItem => ({
  id: p.id,
  from: p.origin ? { lat: p.origin.lat, lon: p.origin.lon, label: areaText(p.origin) } : null,
  to: { lat: p.target.lat, lon: p.target.lon, label: areaText(p.target) },
  createdAt: p.createdAt,
});

export const toRequestView = (r: PrayerRequestRecord, opts: { prayedByMe: boolean; mine: boolean }): RequestView => ({
  id: r.id,
  body: r.body,
  name: r.anonymous ? null : r.displayName,
  faith: r.showFaith ? faithOptionLabel(r.faith) : null,
  area: toAreaView(r.area),
  prayedCount: r.prayedCount,
  prayedByMe: opts.prayedByMe,
  mine: opts.mine,
  closed: r.closed,
  visibility: r.visibility,
  status: r.status,
  createdAt: r.createdAt,
});

export const ownsWorldPrayer = (p: WorldPrayerRecord, who: { deviceId: string; userId: string | null }) =>
  (who.userId !== null && p.senderUser === who.userId) || (!p.senderUser && p.senderDevice === who.deviceId);
