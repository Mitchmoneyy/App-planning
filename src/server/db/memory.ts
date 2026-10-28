/**
 * Development / demo store. Keeps everything in memory and, when the disk is
 * writable, saves it to .data/db.json so it survives restarts.
 *
 * Use Postgres (DATABASE_URL) in production: serverless hosts like Vercel
 * don't keep files between requests, so data here would reset.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  defaultSettings,
  senderActor,
  type AreaSummary,
  type BlockRecord,
  type NewPrayerRequest,
  type NewWorldPrayer,
  type NotificationRecord,
  type PrayerRequestRecord,
  type PushSubscriptionRecord,
  type ReportableKind,
  type UserSettings,
  type WorldPrayerRecord,
  type WorldStatus,
  DuplicateError,
  type Identity,
  type NewPrayer,
  type PlaceStats,
  type PrayerRecord,
  type PrayerStatus,
  type ReviewRecord,
  type ReviewStatus,
  type ReviewSummary,
  type Store,
  type UserRecord,
} from "./types";

interface Snapshot {
  prayers: PrayerRecord[];
  reviews: ReviewRecord[];
  users: UserRecord[];
  sessions: { tokenHash: string; userId: string; expiresAt: string }[];
  candles: { placeId: string; actor: string; at: string }[];
  prayedFor: { prayerId: string; actor: string }[];
  reports: { prayerId: string; actor: string; reason: string; at: string }[];
  favorites: { actor: string; placeId: string; at: string }[];
  worldPrayers: WorldPrayerRecord[];
  requests: PrayerRequestRecord[];
  requestPrayers: { requestId: string; actor: string }[];
  contentReports: { kind: ReportableKind; id: string; actor: string; reason: string; at: string }[];
  blocks: BlockRecord[];
  notifications: NotificationRecord[];
  settings: UserSettings[];
  pushSubs: PushSubscriptionRecord[];
}

const empty = (): Snapshot => ({
  prayers: [],
  reviews: [],
  users: [],
  sessions: [],
  candles: [],
  prayedFor: [],
  reports: [],
  favorites: [],
  worldPrayers: [],
  requests: [],
  requestPrayers: [],
  contentReports: [],
  blocks: [],
  notifications: [],
  settings: [],
  pushSubs: [],
});

const DAY_MS = 24 * 60 * 60 * 1000;

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  persistent: boolean;
  private db: Snapshot;
  private saveTimer: NodeJS.Timeout | null = null;

  // turbopackIgnore: this local file isn't part of the app bundle (avoids tracing the whole project).
  constructor(private file: string | null = join(/* turbopackIgnore: true */ process.cwd(), ".data", "db.json")) {
    this.db = empty();
    this.persistent = false;
    if (!file) return;
    try {
      this.db = { ...empty(), ...JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8")) };
      this.persistent = true;
    } catch {
      // No file yet: check we can create one.
      try {
        mkdirSync(/* turbopackIgnore: true */ dirname(file), { recursive: true });
        writeFileSync(/* turbopackIgnore: true */ file, JSON.stringify(this.db));
        this.persistent = true;
      } catch {
        this.persistent = false; // read-only disk (e.g. serverless): memory only
      }
    }
  }

  /** Debounced save so bursts of writes cost one disk write. */
  private save() {
    if (!this.persistent || !this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        writeFileSync(/* turbopackIgnore: true */ this.file!, JSON.stringify(this.db));
      } catch (err) {
        console.error("Could not save .data/db.json", err);
      }
    }, 200);
  }

  // --- Candles & counts ---

  async getPlaceStats(placeId: string): Promise<PlaceStats> {
    const since = Date.now() - DAY_MS;
    const candles = this.db.candles.filter((c) => c.placeId === placeId);
    return {
      candles: candles.length,
      candlesToday: candles.filter((c) => Date.parse(c.at) >= since).length,
      prayers: this.db.prayers.filter((p) => p.placeId === placeId && p.status !== "rejected").length,
    };
  }

  async lastCandleAt(placeId: string, actor: string) {
    let last: string | null = null;
    for (const c of this.db.candles) if (c.placeId === placeId && c.actor === actor && (!last || c.at > last)) last = c.at;
    return last ? new Date(last) : null;
  }

  async lightCandle(placeId: string, actor: string) {
    this.db.candles.push({ placeId, actor, at: new Date().toISOString() });
    this.save();
  }

  // --- Prayers ---

  async createPrayer(input: NewPrayer): Promise<PrayerRecord> {
    const prayer: PrayerRecord = { ...input, id: randomUUID(), prayedCount: 0, reportCount: 0, createdAt: new Date().toISOString() };
    this.db.prayers.push(prayer);
    this.save();
    return { ...prayer };
  }

  async getPrayer(id: string) {
    const p = this.db.prayers.find((x) => x.id === id);
    return p ? { ...p } : null;
  }

  async listPublicPrayers(placeId: string, limit: number, before?: string) {
    return this.db.prayers
      .filter((p) => p.placeId === placeId && p.status === "published" && (!before || p.createdAt < before))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }

  async listOwnPrayers(who: Identity) {
    return this.db.prayers
      .filter((p) => (who.userId && p.ownerUser === who.userId) || (!p.ownerUser && p.ownerDevice === who.deviceId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({ ...p }));
  }

  async deletePrayer(id: string) {
    this.db.prayers = this.db.prayers.filter((p) => p.id !== id);
    this.db.prayedFor = this.db.prayedFor.filter((r) => r.prayerId !== id);
    this.db.reports = this.db.reports.filter((r) => r.prayerId !== id);
    this.save();
  }

  async setPrayerStatus(id: string, status: PrayerStatus, note: string | null = null) {
    const p = this.db.prayers.find((x) => x.id === id);
    if (p) {
      p.status = status;
      p.moderationNote = note;
      this.save();
    }
  }

  async addPrayedFor(prayerId: string, actor: string) {
    if (this.db.prayedFor.some((r) => r.prayerId === prayerId && r.actor === actor)) return false;
    const p = this.db.prayers.find((x) => x.id === prayerId);
    if (!p) return false;
    this.db.prayedFor.push({ prayerId, actor });
    p.prayedCount += 1;
    this.save();
    return true;
  }

  async prayedForSet(prayerIds: string[], actor: string) {
    const ids = new Set(prayerIds);
    return new Set(this.db.prayedFor.filter((r) => r.actor === actor && ids.has(r.prayerId)).map((r) => r.prayerId));
  }

  async addReport(prayerId: string, actor: string, reason: string) {
    const p = this.db.prayers.find((x) => x.id === prayerId);
    if (!p) return 0;
    if (!this.db.reports.some((r) => r.prayerId === prayerId && r.actor === actor)) {
      this.db.reports.push({ prayerId, actor, reason, at: new Date().toISOString() });
      p.reportCount += 1;
      this.save();
    }
    return p.reportCount;
  }

  // --- Favorites ---

  async listFavorites(actor: string) {
    return this.db.favorites
      .filter((f) => f.actor === actor)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((f) => f.placeId);
  }

  async setFavorite(actor: string, placeId: string, on: boolean) {
    const exists = this.db.favorites.some((f) => f.actor === actor && f.placeId === placeId);
    if (on && !exists) this.db.favorites.push({ actor, placeId, at: new Date().toISOString() });
    if (!on) this.db.favorites = this.db.favorites.filter((f) => !(f.actor === actor && f.placeId === placeId));
    this.save();
  }

  // --- Reviews ---

  async listReviews(placeId: string) {
    return this.db.reviews
      .filter((r) => r.placeId === placeId && r.status === "published")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((r) => ({ ...r }));
  }

  async getReviewSummary(placeId: string): Promise<ReviewSummary> {
    const list = this.db.reviews.filter((r) => r.placeId === placeId && r.status === "published");
    if (!list.length) return { count: 0, average: null };
    return { count: list.length, average: list.reduce((s, r) => s + r.rating, 0) / list.length };
  }

  async getUserReview(placeId: string, userId: string) {
    const r = this.db.reviews.find((x) => x.placeId === placeId && x.userId === userId);
    return r ? { ...r } : null;
  }

  async upsertReview(input: Omit<ReviewRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const existing = this.db.reviews.find((r) => r.placeId === input.placeId && r.userId === input.userId);
    if (existing) {
      Object.assign(existing, input, { updatedAt: now });
      this.save();
      return { ...existing };
    }
    const review: ReviewRecord = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    this.db.reviews.push(review);
    this.save();
    return { ...review };
  }

  async deleteReview(placeId: string, userId: string) {
    this.db.reviews = this.db.reviews.filter((r) => !(r.placeId === placeId && r.userId === userId));
    this.save();
  }

  async setReviewStatus(id: string, status: ReviewStatus, note: string | null = null) {
    const r = this.db.reviews.find((x) => x.id === id);
    if (r) {
      r.status = status;
      r.moderationNote = note;
      this.save();
    }
  }

  async listModerationQueue() {
    const queued = new Set(["pending", "hidden"]);
    return {
      prayers: this.db.prayers.filter((p) => queued.has(p.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      reviews: this.db.reviews.filter((r) => queued.has(r.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      worldPrayers: this.db.worldPrayers.filter((p) => queued.has(p.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      requests: this.db.requests.filter((r) => queued.has(r.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  // --- Accounts ---

  async createUser(input: Omit<UserRecord, "id" | "createdAt">) {
    if (this.db.users.some((u) => u.email === input.email)) throw new DuplicateError("Email already registered");
    const user: UserRecord = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.db.users.push(user);
    this.save();
    return { ...user };
  }

  async getUserByEmail(email: string) {
    const u = this.db.users.find((x) => x.email === email);
    return u ? { ...u } : null;
  }

  async getUserById(id: string) {
    const u = this.db.users.find((x) => x.id === id);
    return u ? { ...u } : null;
  }

  async deleteUser(id: string, deviceId: string) {
    const actors = new Set([`u:${id}`, `d:${deviceId}`]);
    const prayerIds = new Set(this.db.prayers.filter((p) => p.ownerUser === id || p.ownerDevice === deviceId).map((p) => p.id));
    this.db.prayers = this.db.prayers.filter((p) => !prayerIds.has(p.id));
    this.db.prayedFor = this.db.prayedFor.filter((r) => !prayerIds.has(r.prayerId) && !actors.has(r.actor));
    this.db.reports = this.db.reports.filter((r) => !prayerIds.has(r.prayerId));
    this.db.reviews = this.db.reviews.filter((r) => r.userId !== id);
    this.db.favorites = this.db.favorites.filter((f) => !actors.has(f.actor));
    this.db.candles = this.db.candles.map((c) => (actors.has(c.actor) ? { ...c, actor: "deleted" } : c)); // keep counts
    this.db.sessions = this.db.sessions.filter((s) => s.userId !== id);
    this.db.worldPrayers = this.db.worldPrayers.filter((p) => p.senderUser !== id && p.senderDevice !== deviceId);
    const requestIds = new Set(this.db.requests.filter((r) => r.userId === id).map((r) => r.id));
    this.db.requests = this.db.requests.filter((r) => r.userId !== id);
    this.db.requestPrayers = this.db.requestPrayers.filter((r) => !requestIds.has(r.requestId) && !actors.has(r.actor));
    this.db.blocks = this.db.blocks.filter((b) => !actors.has(b.blockerActor));
    this.db.notifications = this.db.notifications.filter((n) => n.userId !== id);
    this.db.settings = this.db.settings.filter((x) => x.userId !== id);
    this.db.pushSubs = this.db.pushSubs.filter((x) => x.userId !== id);
    this.db.users = this.db.users.filter((u) => u.id !== id);
    this.save();
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    this.db.sessions.push({ tokenHash, userId, expiresAt: expiresAt.toISOString() });
    this.save();
  }

  async getSessionUser(tokenHash: string) {
    const s = this.db.sessions.find((x) => x.tokenHash === tokenHash);
    if (!s || Date.parse(s.expiresAt) < Date.now()) return null;
    return s.userId;
  }

  async deleteSession(tokenHash: string) {
    this.db.sessions = this.db.sessions.filter((s) => s.tokenHash !== tokenHash);
    this.save();
  }

  async mergeDeviceIntoUser(deviceId: string, userId: string) {
    const from = `d:${deviceId}`;
    const to = `u:${userId}`;
    for (const p of this.db.prayers) if (p.ownerDevice === deviceId && !p.ownerUser) p.ownerUser = userId;
    for (const c of this.db.candles) if (c.actor === from) c.actor = to;
    // One-per-person tables: move rows, dropping any that would duplicate.
    const move = <T extends { actor: string }>(rows: T[], key: (r: T) => string) => {
      const existing = new Set(rows.filter((r) => r.actor === to).map(key));
      return rows.filter((r) => {
        if (r.actor !== from) return true;
        if (existing.has(key(r))) return false;
        r.actor = to;
        return true;
      });
    };
    this.db.favorites = move(this.db.favorites, (f) => f.placeId);
    this.db.prayedFor = move(this.db.prayedFor, (r) => r.prayerId);
    this.db.requestPrayers = move(this.db.requestPrayers, (r) => r.requestId);
    for (const p of this.db.worldPrayers) if (p.senderDevice === deviceId && !p.senderUser) p.senderUser = userId;
    const existingBlocks = new Set(this.db.blocks.filter((b) => b.blockerActor === to).map((b) => b.blockedActor));
    this.db.blocks = this.db.blocks.filter((b) => {
      if (b.blockerActor !== from) return true;
      if (existingBlocks.has(b.blockedActor)) return false;
      b.blockerActor = to;
      return true;
    });
    this.save();
  }

  // --- Prayers for places ---

  async createWorldPrayer(input: NewWorldPrayer) {
    const p: WorldPrayerRecord = { ...input, id: randomUUID(), reportCount: 0, createdAt: new Date().toISOString() };
    this.db.worldPrayers.push(p);
    this.save();
    return structuredClone(p);
  }

  async getWorldPrayer(id: string) {
    const p = this.db.worldPrayers.find((x) => x.id === id);
    return p ? structuredClone(p) : null;
  }

  async listWorldPrayers(o: Parameters<Store["listWorldPrayers"]>[0]) {
    const excluded = new Set(o.excludeActors ?? []);
    return this.db.worldPrayers
      .filter(
        (p) =>
          p.status === "published" &&
          (!o.before || p.createdAt < o.before) &&
          (!o.since || p.createdAt > o.since) &&
          (o.targetCityId === undefined || p.target.cityId === o.targetCityId) &&
          (o.targetCc === undefined || p.target.cc === o.targetCc) &&
          (o.requestId === undefined || p.requestId === o.requestId) &&
          !excluded.has(senderActor(p)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, o.limit)
      .map((p) => structuredClone(p));
  }

  async listOwnWorldPrayers(who: Identity) {
    return this.db.worldPrayers
      .filter((p) => (who.userId && p.senderUser === who.userId) || (!p.senderUser && p.senderDevice === who.deviceId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => structuredClone(p));
  }

  async setWorldPrayerStatus(id: string, status: WorldStatus, note: string | null = null) {
    const p = this.db.worldPrayers.find((x) => x.id === id);
    if (p) {
      p.status = status;
      p.moderationNote = note;
      this.save();
    }
  }

  async worldStats() {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const published = this.db.worldPrayers.filter((p) => p.status === "published");
    return { total: published.length, last24h: published.filter((p) => p.createdAt > since).length };
  }

  async areaSummary(cityId: number | null, cc: string): Promise<AreaSummary> {
    const published = this.db.worldPrayers.filter((p) => p.status === "published");
    const toCountry = published.filter((p) => p.target.cc === cc);
    const toCity = cityId === null ? [] : toCountry.filter((p) => p.target.cityId === cityId);
    const counts = new Map<string, number>();
    for (const p of toCountry) if (p.origin) counts.set(p.origin.cc, (counts.get(p.origin.cc) ?? 0) + 1);
    return {
      toCity: toCity.length,
      toCountry: toCountry.length,
      fromCountries: [...counts].map(([c, count]) => ({ cc: c, count })).sort((a, b) => b.count - a.count),
    };
  }

  // --- Prayer requests ---

  async createRequest(input: NewPrayerRequest) {
    const r: PrayerRequestRecord = { ...input, id: randomUUID(), prayedCount: 0, reportCount: 0, closed: false, createdAt: new Date().toISOString() };
    this.db.requests.push(r);
    this.save();
    return structuredClone(r);
  }

  async getRequest(id: string) {
    const r = this.db.requests.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }

  async listPublicRequests(o: Parameters<Store["listPublicRequests"]>[0]) {
    const excluded = new Set(o.excludeActors ?? []);
    return this.db.requests
      .filter(
        (r) =>
          r.status === "published" &&
          r.visibility === "public" &&
          !r.closed &&
          (!o.before || r.createdAt < o.before) &&
          (!o.cc || r.area.cc === o.cc) &&
          !excluded.has(`u:${r.userId}`),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, o.limit)
      .map((r) => structuredClone(r));
  }

  async listOwnRequests(userId: string) {
    return this.db.requests
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => structuredClone(r));
  }

  async updateRequest(id: string, changes: Parameters<Store["updateRequest"]>[1]) {
    const r = this.db.requests.find((x) => x.id === id);
    if (r) {
      Object.assign(r, changes);
      this.save();
    }
  }

  async deleteRequest(id: string) {
    this.db.requests = this.db.requests.filter((r) => r.id !== id);
    this.db.requestPrayers = this.db.requestPrayers.filter((r) => r.requestId !== id);
    for (const p of this.db.worldPrayers) if (p.requestId === id) p.requestId = null;
    this.save();
  }

  async addRequestPrayer(requestId: string, actor: string) {
    const r = this.db.requests.find((x) => x.id === requestId);
    if (!r || this.db.requestPrayers.some((x) => x.requestId === requestId && x.actor === actor)) return false;
    this.db.requestPrayers.push({ requestId, actor });
    r.prayedCount += 1;
    this.save();
    return true;
  }

  async prayedForRequests(requestIds: string[], actor: string) {
    const ids = new Set(requestIds);
    return new Set(this.db.requestPrayers.filter((r) => r.actor === actor && ids.has(r.requestId)).map((r) => r.requestId));
  }

  // --- Reports & blocks ---

  async addContentReport(kind: ReportableKind, id: string, actor: string, reason: string) {
    const target = kind === "world_prayer" ? this.db.worldPrayers.find((x) => x.id === id) : this.db.requests.find((x) => x.id === id);
    if (!target) return 0;
    if (!this.db.contentReports.some((r) => r.kind === kind && r.id === id && r.actor === actor)) {
      this.db.contentReports.push({ kind, id, actor, reason, at: new Date().toISOString() });
      target.reportCount += 1;
      this.save();
    }
    return target.reportCount;
  }

  async addBlock(blockerActor: string, blockedActor: string, label: string) {
    if (blockerActor === blockedActor || this.db.blocks.some((b) => b.blockerActor === blockerActor && b.blockedActor === blockedActor)) return;
    this.db.blocks.push({ id: randomUUID(), blockerActor, blockedActor, label, createdAt: new Date().toISOString() });
    this.save();
  }

  async listBlocks(blockerActor: string) {
    return this.db.blocks.filter((b) => b.blockerActor === blockerActor).map((b) => ({ ...b }));
  }

  async removeBlock(blockerActor: string, id: string) {
    this.db.blocks = this.db.blocks.filter((b) => !(b.blockerActor === blockerActor && b.id === id));
    this.save();
  }

  async blockedActors(blockerActor: string) {
    return this.db.blocks.filter((b) => b.blockerActor === blockerActor).map((b) => b.blockedActor);
  }

  async isBlocked(blockerActor: string, actors: string[]) {
    return this.db.blocks.some((b) => b.blockerActor === blockerActor && actors.includes(b.blockedActor));
  }

  // --- Notifications & settings ---

  async createNotification(n: Omit<NotificationRecord, "id" | "createdAt" | "readAt">) {
    const rec: NotificationRecord = { ...n, id: randomUUID(), createdAt: new Date().toISOString(), readAt: null };
    this.db.notifications.push(rec);
    this.save();
    return { ...rec };
  }

  async listNotifications(userId: string, limit: number) {
    return this.db.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((n) => ({ ...n }));
  }

  async unreadCount(userId: string) {
    return this.db.notifications.filter((n) => n.userId === userId && !n.readAt).length;
  }

  async markNotificationsRead(userId: string) {
    const now = new Date().toISOString();
    for (const n of this.db.notifications) if (n.userId === userId && !n.readAt) n.readAt = now;
    this.save();
  }

  async getSettings(userId: string) {
    const s = this.db.settings.find((x) => x.userId === userId);
    return s ? structuredClone(s) : defaultSettings(userId);
  }

  async saveSettings(settings: UserSettings) {
    this.db.settings = this.db.settings.filter((x) => x.userId !== settings.userId);
    this.db.settings.push(structuredClone(settings));
    this.save();
  }

  async usersWatchingCity(cityId: number) {
    return this.db.settings.filter((s) => s.notifyArea && s.home?.cityId === cityId).map((s) => structuredClone(s));
  }

  async addPushSubscription(sub: Omit<PushSubscriptionRecord, "id" | "createdAt">) {
    this.db.pushSubs = this.db.pushSubs.filter((x) => x.endpoint !== sub.endpoint);
    this.db.pushSubs.push({ ...sub, id: randomUUID(), createdAt: new Date().toISOString() });
    this.save();
  }

  async listPushSubscriptions(userId: string) {
    return this.db.pushSubs.filter((x) => x.userId === userId).map((x) => ({ ...x }));
  }

  async deletePushSubscription(endpoint: string) {
    this.db.pushSubs = this.db.pushSubs.filter((x) => x.endpoint !== endpoint);
    this.save();
  }
}
