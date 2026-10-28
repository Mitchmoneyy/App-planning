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

// --- Praying for people in places ------------------------------------------

/** A rounded location: a city centre or a whole country. Never exact. */
export interface AreaRef {
  kind: "city" | "country";
  cityId: number | null;
  cc: string;
  name: string;
  lat: number;
  lon: number;
}

export type WorldStatus = "published" | "pending" | "rejected" | "hidden";

/** A prayer or blessing sent to a place (optionally answering a request). */
export interface WorldPrayerRecord {
  id: string;
  senderDevice: string;
  senderUser: string | null;
  body: string;
  templateId: string | null;
  faith: string | null;
  showFaith: boolean;
  anonymous: boolean;
  displayName: string | null;
  target: AreaRef;
  /** Where it was sent from (city or country), or null if the sender chose not to share. */
  origin: AreaRef | null;
  requestId: string | null;
  status: WorldStatus;
  moderationNote: string | null;
  reportCount: number;
  createdAt: string;
}

export type NewWorldPrayer = Omit<WorldPrayerRecord, "id" | "reportCount" | "createdAt">;

/** Someone asking others to pray for them, tied to their (rounded) area. */
export interface PrayerRequestRecord {
  id: string;
  userId: string;
  body: string;
  faith: string | null;
  showFaith: boolean;
  anonymous: boolean;
  displayName: string;
  area: AreaRef;
  /** public = shown on the globe and lists; unlisted = only via its link. */
  visibility: "public" | "unlisted";
  status: WorldStatus;
  moderationNote: string | null;
  prayedCount: number;
  reportCount: number;
  closed: boolean;
  createdAt: string;
}

export type NewPrayerRequest = Omit<PrayerRequestRecord, "id" | "prayedCount" | "reportCount" | "closed" | "createdAt">;

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: "request_prayed" | "area_prayer" | "system";
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface UserSettings {
  userId: string;
  /** Home area (city level) for requests and "prayers for your area". */
  home: AreaRef | null;
  notifyRequests: boolean; // someone prayed for my request
  notifyArea: boolean; // someone prayed for my city
  email: boolean;
  push: boolean;
  lastEmailAt: string | null;
  lastAreaNoticeAt: string | null;
}

export const defaultSettings = (userId: string): UserSettings => ({
  userId,
  home: null,
  notifyRequests: true,
  notifyArea: false,
  email: false,
  push: false,
  lastEmailAt: null,
  lastAreaNoticeAt: null,
});

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  kind: "web" | "expo";
  /** Web push endpoint URL, or Expo push token. */
  endpoint: string;
  /** Web push keys as JSON ({ p256dh, auth }). */
  keys: string | null;
  createdAt: string;
}

export interface BlockRecord {
  id: string;
  blockerActor: string;
  blockedActor: string;
  /** What the person saw when blocking, e.g. "a prayer for Manila" — never the other person's identity. */
  label: string;
  createdAt: string;
}

export interface AreaSummary {
  toCity: number;
  toCountry: number;
  /** Where prayers for this area came from (country codes), most first. */
  fromCountries: { cc: string; count: number }[];
}

export type ReportableKind = "world_prayer" | "request";

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
  listModerationQueue(): Promise<{ prayers: PrayerRecord[]; reviews: ReviewRecord[]; worldPrayers: WorldPrayerRecord[]; requests: PrayerRequestRecord[] }>;

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

  // --- Prayers for places ---
  createWorldPrayer(p: NewWorldPrayer): Promise<WorldPrayerRecord>;
  getWorldPrayer(id: string): Promise<WorldPrayerRecord | null>;
  /** Published prayers, newest first, optionally for one area or request, hiding blocked senders. */
  listWorldPrayers(opts: {
    limit: number;
    before?: string;
    since?: string;
    targetCityId?: number;
    targetCc?: string;
    requestId?: string;
    excludeActors?: string[];
  }): Promise<WorldPrayerRecord[]>;
  listOwnWorldPrayers(who: Identity): Promise<WorldPrayerRecord[]>;
  setWorldPrayerStatus(id: string, status: WorldStatus, note?: string | null): Promise<void>;
  worldStats(): Promise<{ total: number; last24h: number }>;
  areaSummary(cityId: number | null, cc: string): Promise<AreaSummary>;

  // --- Prayer requests ---
  createRequest(r: NewPrayerRequest): Promise<PrayerRequestRecord>;
  getRequest(id: string): Promise<PrayerRequestRecord | null>;
  listPublicRequests(opts: { limit: number; before?: string; cc?: string; excludeActors?: string[] }): Promise<PrayerRequestRecord[]>;
  listOwnRequests(userId: string): Promise<PrayerRequestRecord[]>;
  updateRequest(id: string, changes: Partial<Pick<PrayerRequestRecord, "closed" | "visibility" | "status" | "moderationNote">>): Promise<void>;
  deleteRequest(id: string): Promise<void>;
  /** Counts one prayer per actor; returns false if this actor already prayed for it. */
  addRequestPrayer(requestId: string, actor: string): Promise<boolean>;
  prayedForRequests(requestIds: string[], actor: string): Promise<Set<string>>;

  // --- Reports & blocks ---
  addContentReport(kind: ReportableKind, id: string, actor: string, reason: string): Promise<number>;
  addBlock(blockerActor: string, blockedActor: string, label: string): Promise<void>;
  listBlocks(blockerActor: string): Promise<BlockRecord[]>;
  removeBlock(blockerActor: string, id: string): Promise<void>;
  blockedActors(blockerActor: string): Promise<string[]>;
  /** Whether `blockerActor` has blocked any of these actors. */
  isBlocked(blockerActor: string, actors: string[]): Promise<boolean>;

  // --- Notifications & settings ---
  createNotification(n: Omit<NotificationRecord, "id" | "createdAt" | "readAt">): Promise<NotificationRecord>;
  listNotifications(userId: string, limit: number): Promise<NotificationRecord[]>;
  unreadCount(userId: string): Promise<number>;
  markNotificationsRead(userId: string): Promise<void>;
  getSettings(userId: string): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;
  /** Users whose home is this city and who want area notifications. */
  usersWatchingCity(cityId: number): Promise<UserSettings[]>;
  addPushSubscription(sub: Omit<PushSubscriptionRecord, "id" | "createdAt">): Promise<void>;
  listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>;
  deletePushSubscription(endpoint: string): Promise<void>;
}

/** The actor key of whoever wrote something, for blocking. */
export const senderActor = (r: { senderUser?: string | null; senderDevice?: string; ownerUser?: string | null; ownerDevice?: string }) => {
  const user = r.senderUser ?? r.ownerUser;
  return user ? `u:${user}` : `d:${r.senderDevice ?? r.ownerDevice}`;
};
