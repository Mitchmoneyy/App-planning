/**
 * Production store on PostgreSQL (Supabase, Neon, or any Postgres).
 * Schema: db/schema.sql. Connection: DATABASE_URL.
 *
 * On Supabase with serverless hosting, use the "Transaction pooler" connection
 * string (port 6543); prepared statements are disabled below to support it.
 */
import postgres from "postgres";
import {
  DuplicateError,
  type Identity,
  type NewPrayer,
  type PlaceStats,
  type PrayerRecord,
  type PrayerStatus,
  type ReviewRecord,
  type ReviewStatus,
  type Store,
  type UserRecord,
} from "./types";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

const toPrayer = (r: Row): PrayerRecord => ({
  id: r.id as string,
  placeId: r.place_id as string,
  ownerDevice: r.owner_device as string,
  ownerUser: (r.owner_user as string) ?? null,
  body: r.body as string,
  isPublic: r.is_public as boolean,
  anonymous: r.anonymous as boolean,
  displayName: (r.display_name as string) ?? null,
  status: r.status as PrayerStatus,
  moderationNote: (r.moderation_note as string) ?? null,
  prayedCount: Number(r.prayed_count),
  reportCount: Number(r.report_count),
  createdAt: iso(r.created_at),
});

const toReview = (r: Row): ReviewRecord => ({
  id: r.id as string,
  placeId: r.place_id as string,
  userId: r.user_id as string,
  displayName: r.display_name as string,
  rating: Number(r.rating),
  body: r.body as string,
  status: r.status as ReviewStatus,
  moderationNote: (r.moderation_note as string) ?? null,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const toUser = (r: Row): UserRecord => ({
  id: r.id as string,
  email: r.email as string,
  displayName: r.display_name as string,
  passwordHash: r.password_hash as string,
  createdAt: iso(r.created_at),
});

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  readonly persistent = true;
  private sql: postgres.Sql;

  constructor(url: string) {
    this.sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20, onnotice: () => {} });
  }

  async close() {
    await this.sql.end();
  }

  // --- Candles & counts ---

  async getPlaceStats(placeId: string): Promise<PlaceStats> {
    const [row] = await this.sql`
      select
        (select count(*) from candles where place_id = ${placeId}) as candles,
        (select count(*) from candles where place_id = ${placeId} and created_at > now() - interval '24 hours') as candles_today,
        (select count(*) from prayers where place_id = ${placeId} and status <> 'rejected') as prayers`;
    return { candles: Number(row.candles), candlesToday: Number(row.candles_today), prayers: Number(row.prayers) };
  }

  async lastCandleAt(placeId: string, actor: string) {
    const [row] = await this.sql`
      select max(created_at) as at from candles where place_id = ${placeId} and actor = ${actor}`;
    return row?.at ? new Date(row.at) : null;
  }

  async lightCandle(placeId: string, actor: string) {
    await this.sql`insert into candles (place_id, actor) values (${placeId}, ${actor})`;
  }

  // --- Prayers ---

  async createPrayer(p: NewPrayer) {
    const [row] = await this.sql`
      insert into prayers (place_id, owner_device, owner_user, body, is_public, anonymous, display_name, status, moderation_note)
      values (${p.placeId}, ${p.ownerDevice}, ${p.ownerUser}, ${p.body}, ${p.isPublic}, ${p.anonymous}, ${p.displayName}, ${p.status}, ${p.moderationNote})
      returning *`;
    return toPrayer(row);
  }

  async getPrayer(id: string) {
    if (!isUuid(id)) return null;
    const [row] = await this.sql`select * from prayers where id = ${id}`;
    return row ? toPrayer(row) : null;
  }

  async listPublicPrayers(placeId: string, limit: number, before?: string) {
    const rows = before
      ? await this.sql`select * from prayers where place_id = ${placeId} and status = 'published' and created_at < ${before}
                       order by created_at desc limit ${limit}`
      : await this.sql`select * from prayers where place_id = ${placeId} and status = 'published'
                       order by created_at desc limit ${limit}`;
    return rows.map(toPrayer);
  }

  async listOwnPrayers(who: Identity) {
    const rows = await this.sql`
      select * from prayers
      where (${who.userId}::uuid is not null and owner_user = ${who.userId}::uuid)
         or (owner_user is null and owner_device = ${who.deviceId})
      order by created_at desc limit 500`;
    return rows.map(toPrayer);
  }

  async deletePrayer(id: string) {
    if (isUuid(id)) await this.sql`delete from prayers where id = ${id}`;
  }

  async setPrayerStatus(id: string, status: PrayerStatus, note: string | null = null) {
    if (isUuid(id)) await this.sql`update prayers set status = ${status}, moderation_note = ${note} where id = ${id}`;
  }

  async addPrayedFor(prayerId: string, actor: string) {
    if (!isUuid(prayerId)) return false;
    return this.sql.begin(async (tx) => {
      const inserted = await tx`
        insert into prayed_for (prayer_id, actor) select ${prayerId}, ${actor}
        where exists (select 1 from prayers where id = ${prayerId})
        on conflict do nothing returning prayer_id`;
      if (!inserted.length) return false;
      await tx`update prayers set prayed_count = prayed_count + 1 where id = ${prayerId}`;
      return true;
    });
  }

  async prayedForSet(prayerIds: string[], actor: string) {
    const ids = prayerIds.filter(isUuid);
    if (!ids.length) return new Set<string>();
    const rows = await this.sql`select prayer_id from prayed_for where actor = ${actor} and prayer_id = any(${ids}::uuid[])`;
    return new Set(rows.map((r) => r.prayer_id as string));
  }

  async addReport(prayerId: string, actor: string, reason: string) {
    if (!isUuid(prayerId)) return 0;
    return this.sql.begin(async (tx) => {
      const inserted = await tx`
        insert into prayer_reports (prayer_id, actor, reason) select ${prayerId}, ${actor}, ${reason}
        where exists (select 1 from prayers where id = ${prayerId})
        on conflict do nothing returning prayer_id`;
      const [row] = inserted.length
        ? await tx`update prayers set report_count = report_count + 1 where id = ${prayerId} returning report_count`
        : await tx`select report_count from prayers where id = ${prayerId}`;
      return row ? Number(row.report_count) : 0;
    });
  }

  // --- Favorites ---

  async listFavorites(actor: string) {
    const rows = await this.sql`select place_id from favorites where actor = ${actor} order by created_at desc`;
    return rows.map((r) => r.place_id as string);
  }

  async setFavorite(actor: string, placeId: string, on: boolean) {
    if (on) await this.sql`insert into favorites (actor, place_id) values (${actor}, ${placeId}) on conflict do nothing`;
    else await this.sql`delete from favorites where actor = ${actor} and place_id = ${placeId}`;
  }

  // --- Reviews ---

  async listReviews(placeId: string) {
    const rows = await this.sql`
      select * from reviews where place_id = ${placeId} and status = 'published' order by updated_at desc limit 200`;
    return rows.map(toReview);
  }

  async getReviewSummary(placeId: string) {
    const [row] = await this.sql`
      select count(*) as n, avg(rating)::float as avg from reviews where place_id = ${placeId} and status = 'published'`;
    const count = Number(row.n);
    return { count, average: count ? Number(row.avg) : null };
  }

  async getUserReview(placeId: string, userId: string) {
    const [row] = await this.sql`select * from reviews where place_id = ${placeId} and user_id = ${userId}`;
    return row ? toReview(row) : null;
  }

  async upsertReview(r: Omit<ReviewRecord, "id" | "createdAt" | "updatedAt">) {
    const [row] = await this.sql`
      insert into reviews (place_id, user_id, display_name, rating, body, status, moderation_note)
      values (${r.placeId}, ${r.userId}, ${r.displayName}, ${r.rating}, ${r.body}, ${r.status}, ${r.moderationNote})
      on conflict (place_id, user_id) do update set
        display_name = excluded.display_name, rating = excluded.rating, body = excluded.body,
        status = excluded.status, moderation_note = excluded.moderation_note, updated_at = now()
      returning *`;
    return toReview(row);
  }

  async deleteReview(placeId: string, userId: string) {
    await this.sql`delete from reviews where place_id = ${placeId} and user_id = ${userId}`;
  }

  async setReviewStatus(id: string, status: ReviewStatus, note: string | null = null) {
    if (isUuid(id)) await this.sql`update reviews set status = ${status}, moderation_note = ${note} where id = ${id}`;
  }

  async listModerationQueue() {
    const prayers = await this.sql`select * from prayers where status in ('pending','hidden') order by created_at desc limit 200`;
    const reviews = await this.sql`select * from reviews where status in ('pending','hidden') order by updated_at desc limit 200`;
    return { prayers: prayers.map(toPrayer), reviews: reviews.map(toReview) };
  }

  // --- Accounts ---

  async createUser(u: Omit<UserRecord, "id" | "createdAt">) {
    try {
      const [row] = await this.sql`
        insert into users (email, display_name, password_hash) values (${u.email}, ${u.displayName}, ${u.passwordHash})
        returning *`;
      return toUser(row);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new DuplicateError("Email already registered");
      throw err;
    }
  }

  async getUserByEmail(email: string) {
    const [row] = await this.sql`select * from users where email = ${email}`;
    return row ? toUser(row) : null;
  }

  async getUserById(id: string) {
    if (!isUuid(id)) return null;
    const [row] = await this.sql`select * from users where id = ${id}`;
    return row ? toUser(row) : null;
  }

  async deleteUser(id: string, deviceId: string) {
    const actors = [`u:${id}`, `d:${deviceId}`];
    await this.sql.begin(async (tx) => {
      await tx`delete from prayers where owner_user = ${id} or owner_device = ${deviceId}`;
      await tx`delete from favorites where actor = any(${actors})`;
      await tx`delete from prayed_for where actor = any(${actors})`;
      await tx`update candles set actor = 'deleted' where actor = any(${actors})`; // keep the counts
      await tx`delete from users where id = ${id}`; // cascades to sessions and reviews
    });
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    await this.sql`insert into sessions (token_hash, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`;
  }

  async getSessionUser(tokenHash: string) {
    const [row] = await this.sql`select user_id from sessions where token_hash = ${tokenHash} and expires_at > now()`;
    return row ? (row.user_id as string) : null;
  }

  async deleteSession(tokenHash: string) {
    await this.sql`delete from sessions where token_hash = ${tokenHash}`;
  }

  async mergeDeviceIntoUser(deviceId: string, userId: string) {
    const from = `d:${deviceId}`;
    const to = `u:${userId}`;
    await this.sql.begin(async (tx) => {
      await tx`update prayers set owner_user = ${userId} where owner_device = ${deviceId} and owner_user is null`;
      await tx`update candles set actor = ${to} where actor = ${from}`;
      await tx`insert into favorites (actor, place_id, created_at) select ${to}, place_id, created_at from favorites where actor = ${from} on conflict do nothing`;
      await tx`delete from favorites where actor = ${from}`;
      await tx`insert into prayed_for (prayer_id, actor, created_at) select prayer_id, ${to}, created_at from prayed_for where actor = ${from} on conflict do nothing`;
      await tx`delete from prayed_for where actor = ${from}`;
    });
  }
}
