/** Shapes records into what the browser is allowed to see. */
import "server-only";
import type { PrayerRecord, ReviewRecord } from "./db";
import { openText } from "./security";
import { getPlace } from "@/lib/places.server";
import type { OwnPrayer, ReviewView, WallPrayer } from "@/lib/apiTypes";

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
