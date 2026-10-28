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
});

const DAY_MS = 24 * 60 * 60 * 1000;

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  persistent: boolean;
  private db: Snapshot;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private file: string | null = join(process.cwd(), ".data", "db.json")) {
    this.db = empty();
    this.persistent = false;
    if (!file) return;
    try {
      this.db = { ...empty(), ...JSON.parse(readFileSync(file, "utf8")) };
      this.persistent = true;
    } catch {
      // No file yet: check we can create one.
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(this.db));
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
        writeFileSync(this.file!, JSON.stringify(this.db));
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
    this.save();
  }
}
