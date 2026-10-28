/**
 * Records stored by the app, and the storage interface both back ends
 * (in-memory/file for development, Postgres for production) implement.
 */

/**
 * Who is acting. Everyone gets an anonymous device id (cookie); signed-in
 * users also have a userId. "Actor keys" like "u:<id>" / "d:<id>" are used
 * for one-per-person things such as candles and "I prayed for this".
 */
export interface Identity {
  deviceId: string;
  userId: string | null;
}

export const actorKey = (who: Identity) => (who.userId ? `u:${who.userId}` : `d:${who.deviceId}`);

export type PrayerStatus =
  | "published" // visible on the public wall
  | "pending" // held for a human moderator
  | "rejected" // failed automatic moderation (never shown)
  | "hidden" // removed after reports or by a moderator
  | "private"; // only the author can see it

export interface PrayerRecord {
  id: string;
  placeId: string;
  ownerDevice: string;
  ownerUser: string | null;
  /** Prayer text. Private prayers are encrypted when PRAYER_ENCRYPTION_KEY is set. */
  body: string;
  isPublic: boolean;
  anonymous: boolean;
  displayName: string | null;
  status: PrayerStatus;
  moderationNote: string | null;
  prayedCount: number;
  reportCount: number;
  createdAt: string;
}

export type NewPrayer = Omit<PrayerRecord, "id" | "prayedCount" | "reportCount" | "createdAt">;

export type ReviewStatus = "published" | "pending" | "rejected" | "hidden";

export interface ReviewRecord {
  id: string;
  placeId: string;
  userId: string;
  displayName: string;
  rating: number; // 1–5
  body: string;
  status: ReviewStatus;
  moderationNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

export interface PlaceStats {
  candles: number;
  /** Candles lit in the last 24 hours. */
  candlesToday: number;
  /** All prayers offered here, public and private. */
  prayers: number;
}

export interface ReviewSummary {
  count: number;
  average: number | null;
}

export class DuplicateError extends Error {}

export interface Store {
  /** "memory" (dev / demo) or "postgres". */
  readonly kind: "memory" | "postgres";
  /** False when data will be lost on restart (memory store without a writable disk). */
  readonly persistent: boolean;

  // --- Candles & counts ---
  getPlaceStats(placeId: string): Promise<PlaceStats>;
  lastCandleAt(placeId: string, actor: string): Promise<Date | null>;
  lightCandle(placeId: string, actor: string): Promise<void>;

  // --- Prayers ---
  createPrayer(prayer: NewPrayer): Promise<PrayerRecord>;
  getPrayer(id: string): Promise<PrayerRecord | null>;
  /** Published prayers for a place, newest first. `before` is an ISO date cursor. */
  listPublicPrayers(placeId: string, limit: number, before?: string): Promise<PrayerRecord[]>;
  /** A person's own prayers (any status), newest first. */
  listOwnPrayers(who: Identity): Promise<PrayerRecord[]>;
  deletePrayer(id: string): Promise<void>;
  setPrayerStatus(id: string, status: PrayerStatus, note?: string | null): Promise<void>;
  /** Returns false if this actor already prayed for it. */
  addPrayedFor(prayerId: string, actor: string): Promise<boolean>;
  /** Which of these prayers this actor has prayed for. */
  prayedForSet(prayerIds: string[], actor: string): Promise<Set<string>>;
  /** Records a report (once per actor) and returns the new total. */
  addReport(prayerId: string, actor: string, reason: string): Promise<number>;

  // --- Favorites ---
  listFavorites(actor: string): Promise<string[]>;
  setFavorite(actor: string, placeId: string, on: boolean): Promise<void>;

  // --- Reviews ---
  listReviews(placeId: string): Promise<ReviewRecord[]>;
  getReviewSummary(placeId: string): Promise<ReviewSummary>;
  getUserReview(placeId: string, userId: string): Promise<ReviewRecord | null>;
  upsertReview(review: Omit<ReviewRecord, "id" | "createdAt" | "updatedAt">): Promise<ReviewRecord>;
  deleteReview(placeId: string, userId: string): Promise<void>;
  setReviewStatus(id: string, status: ReviewStatus, note?: string | null): Promise<void>;

  // --- Moderation queue ---
  listModerationQueue(): Promise<{ prayers: PrayerRecord[]; reviews: ReviewRecord[] }>;

  // --- Accounts ---
  createUser(user: Omit<UserRecord, "id" | "createdAt">): Promise<UserRecord>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;
  /** Deletes the account and everything it owns. */
  deleteUser(id: string, deviceId: string): Promise<void>;
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  getSessionUser(tokenHash: string): Promise<string | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** After sign-in: moves this device's anonymous activity onto the account. */
  mergeDeviceIntoUser(deviceId: string, userId: string): Promise<void>;
}
