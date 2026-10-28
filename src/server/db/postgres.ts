/**
 * Production store on PostgreSQL (Supabase, Neon, or any Postgres).
 * Schema: db/schema.sql. Connection: DATABASE_URL.
 *
 * On Supabase with serverless hosting, use the "Transaction pooler" connection
 * string (port 6543); prepared statements are disabled below to support it.
 */
import postgres from "postgres";
import {
  defaultSettings,
  type AreaRef,
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

const area = (r: Row, prefix: string): AreaRef | null =>
  r[`${prefix}_kind`]
    ? {
        kind: r[`${prefix}_kind`] as "city" | "country",
        cityId: r[`${prefix}_city_id`] === null ? null : Number(r[`${prefix}_city_id`]),
        cc: String(r[`${prefix}_cc`]).trim(),
        name: r[`${prefix}_name`] as string,
        lat: Number(r[`${prefix}_lat`]),
        lon: Number(r[`${prefix}_lon`]),
      }
    : null;

const toWorldPrayer = (r: Row): WorldPrayerRecord => ({
  id: r.id as string,
  senderDevice: r.sender_device as string,
  senderUser: (r.sender_user as string) ?? null,
  body: r.body as string,
  templateId: (r.template_id as string) ?? null,
  faith: (r.faith as string) ?? null,
  showFaith: r.show_faith as boolean,
  anonymous: r.anonymous as boolean,
  displayName: (r.display_name as string) ?? null,
  target: area(r, "target")!,
  origin: area(r, "origin"),
  requestId: (r.request_id as string) ?? null,
  status: r.status as WorldStatus,
  moderationNote: (r.moderation_note as string) ?? null,
  reportCount: Number(r.report_count),
  createdAt: iso(r.created_at),
});

const toRequest = (r: Row): PrayerRequestRecord => ({
  id: r.id as string,
  userId: r.user_id as string,
  body: r.body as string,
  faith: (r.faith as string) ?? null,
  showFaith: r.show_faith as boolean,
  anonymous: r.anonymous as boolean,
  displayName: r.display_name as string,
  area: area(r, "area")!,
  visibility: r.visibility as "public" | "unlisted",
  status: r.status as WorldStatus,
  moderationNote: (r.moderation_note as string) ?? null,
  prayedCount: Number(r.prayed_count),
  reportCount: Number(r.report_count),
  closed: r.closed as boolean,
  createdAt: iso(r.created_at),
});

const toNotification = (r: Row): NotificationRecord => ({
  id: r.id as string,
  userId: r.user_id as string,
  kind: r.kind as NotificationRecord["kind"],
  title: r.title as string,
  body: r.body as string,
  link: (r.link as string) ?? null,
  createdAt: iso(r.created_at),
  readAt: r.read_at ? iso(r.read_at) : null,
});

const toSettings = (r: Row): UserSettings => ({
  userId: r.user_id as string,
  home: area(r, "home"),
  notifyRequests: r.notify_requests as boolean,
  notifyArea: r.notify_area as boolean,
  email: r.email as boolean,
  push: r.push as boolean,
  lastEmailAt: r.last_email_at ? iso(r.last_email_at) : null,
  lastAreaNoticeAt: r.last_area_notice_at ? iso(r.last_area_notice_at) : null,
});

/** SQL expression for the author of a world prayer, matching senderActor(). */
const SENDER_ACTOR = "coalesce('u:' || sender_user::text, 'd:' || sender_device)";

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
    const world = await this.sql`select * from world_prayers where status in ('pending','hidden') order by created_at desc limit 200`;
    const requests = await this.sql`select * from prayer_requests where status in ('pending','hidden') order by created_at desc limit 200`;
    return { prayers: prayers.map(toPrayer), reviews: reviews.map(toReview), worldPrayers: world.map(toWorldPrayer), requests: requests.map(toRequest) };
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
      await tx`delete from world_prayers where sender_user = ${id} or sender_device = ${deviceId}`;
      await tx`delete from request_prayers where actor = any(${actors})`;
      await tx`delete from blocks where blocker_actor = any(${actors})`;
      await tx`delete from users where id = ${id}`; // cascades to sessions, reviews, requests, notifications, settings, push
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
      await tx`insert into request_prayers (request_id, actor, created_at) select request_id, ${to}, created_at from request_prayers where actor = ${from} on conflict do nothing`;
      await tx`delete from request_prayers where actor = ${from}`;
      await tx`update world_prayers set sender_user = ${userId} where sender_device = ${deviceId} and sender_user is null`;
      await tx`insert into blocks (blocker_actor, blocked_actor, label, created_at) select ${to}, blocked_actor, label, created_at from blocks where blocker_actor = ${from} on conflict do nothing`;
      await tx`delete from blocks where blocker_actor = ${from}`;
    });
  }

  // --- Prayers for places ---

  async createWorldPrayer(p: NewWorldPrayer) {
    const o = p.origin;
    const [row] = await this.sql`
      insert into world_prayers (sender_device, sender_user, body, template_id, faith, show_faith, anonymous, display_name,
        target_kind, target_city_id, target_cc, target_name, target_lat, target_lon,
        origin_kind, origin_city_id, origin_cc, origin_name, origin_lat, origin_lon, request_id, status, moderation_note)
      values (${p.senderDevice}, ${p.senderUser}, ${p.body}, ${p.templateId}, ${p.faith}, ${p.showFaith}, ${p.anonymous}, ${p.displayName},
        ${p.target.kind}, ${p.target.cityId}, ${p.target.cc}, ${p.target.name}, ${p.target.lat}, ${p.target.lon},
        ${o?.kind ?? null}, ${o?.cityId ?? null}, ${o?.cc ?? null}, ${o?.name ?? null}, ${o?.lat ?? null}, ${o?.lon ?? null},
        ${p.requestId}, ${p.status}, ${p.moderationNote})
      returning *`;
    return toWorldPrayer(row);
  }

  async getWorldPrayer(id: string) {
    if (!isUuid(id)) return null;
    const [row] = await this.sql`select * from world_prayers where id = ${id}`;
    return row ? toWorldPrayer(row) : null;
  }

  async listWorldPrayers(o: Parameters<Store["listWorldPrayers"]>[0]) {
    const sql = this.sql;
    const excluded = o.excludeActors ?? [];
    const rows = await sql`
      select * from world_prayers
      where status = 'published'
        ${o.before ? sql`and created_at < ${o.before}` : sql``}
        ${o.since ? sql`and created_at > ${o.since}` : sql``}
        ${o.targetCityId !== undefined ? sql`and target_city_id = ${o.targetCityId}` : sql``}
        ${o.targetCc !== undefined ? sql`and target_cc = ${o.targetCc}` : sql``}
        ${o.requestId !== undefined ? sql`and request_id = ${o.requestId}` : sql``}
        ${excluded.length ? sql`and ${sql.unsafe(SENDER_ACTOR)} <> all(${excluded})` : sql``}
      order by created_at desc limit ${o.limit}`;
    return rows.map(toWorldPrayer);
  }

  async listOwnWorldPrayers(who: Identity) {
    const rows = await this.sql`
      select * from world_prayers
      where (${who.userId}::uuid is not null and sender_user = ${who.userId}::uuid)
         or (sender_user is null and sender_device = ${who.deviceId})
      order by created_at desc limit 500`;
    return rows.map(toWorldPrayer);
  }

  async setWorldPrayerStatus(id: string, status: WorldStatus, note: string | null = null) {
    if (isUuid(id)) await this.sql`update world_prayers set status = ${status}, moderation_note = ${note} where id = ${id}`;
  }

  async worldStats() {
    const [row] = await this.sql`
      select count(*) as total, count(*) filter (where created_at > now() - interval '24 hours') as day
      from world_prayers where status = 'published'`;
    return { total: Number(row.total), last24h: Number(row.day) };
  }

  async areaSummary(cityId: number | null, cc: string): Promise<AreaSummary> {
    const [counts] = await this.sql`
      select count(*) as to_country, count(*) filter (where target_city_id = ${cityId}) as to_city
      from world_prayers where status = 'published' and target_cc = ${cc}`;
    const from = await this.sql`
      select origin_cc as cc, count(*) as n from world_prayers
      where status = 'published' and target_cc = ${cc} and origin_cc is not null
      group by origin_cc order by n desc limit 50`;
    return {
      toCity: cityId === null ? 0 : Number(counts.to_city),
      toCountry: Number(counts.to_country),
      fromCountries: from.map((r) => ({ cc: String(r.cc).trim(), count: Number(r.n) })),
    };
  }

  // --- Prayer requests ---

  async createRequest(r: NewPrayerRequest) {
    const a = r.area;
    const [row] = await this.sql`
      insert into prayer_requests (user_id, body, faith, show_faith, anonymous, display_name,
        area_kind, area_city_id, area_cc, area_name, area_lat, area_lon, visibility, status, moderation_note)
      values (${r.userId}, ${r.body}, ${r.faith}, ${r.showFaith}, ${r.anonymous}, ${r.displayName},
        ${a.kind}, ${a.cityId}, ${a.cc}, ${a.name}, ${a.lat}, ${a.lon}, ${r.visibility}, ${r.status}, ${r.moderationNote})
      returning *`;
    return toRequest(row);
  }

  async getRequest(id: string) {
    if (!isUuid(id)) return null;
    const [row] = await this.sql`select * from prayer_requests where id = ${id}`;
    return row ? toRequest(row) : null;
  }

  async listPublicRequests(o: Parameters<Store["listPublicRequests"]>[0]) {
    const sql = this.sql;
    const excluded = o.excludeActors ?? [];
    const rows = await sql`
      select * from prayer_requests
      where status = 'published' and visibility = 'public' and not closed
        ${o.before ? sql`and created_at < ${o.before}` : sql``}
        ${o.cc ? sql`and area_cc = ${o.cc}` : sql``}
        ${excluded.length ? sql`and ('u:' || user_id::text) <> all(${excluded})` : sql``}
      order by created_at desc limit ${o.limit}`;
    return rows.map(toRequest);
  }

  async listOwnRequests(userId: string) {
    const rows = await this.sql`select * from prayer_requests where user_id = ${userId} order by created_at desc limit 200`;
    return rows.map(toRequest);
  }

  async updateRequest(id: string, c: Parameters<Store["updateRequest"]>[1]) {
    if (!isUuid(id)) return;
    const cur = await this.getRequest(id);
    if (!cur) return;
    const next = { ...cur, ...c };
    await this.sql`
      update prayer_requests set closed = ${next.closed}, visibility = ${next.visibility}, status = ${next.status},
        moderation_note = ${next.moderationNote} where id = ${id}`;
  }

  async deleteRequest(id: string) {
    if (isUuid(id)) await this.sql`delete from prayer_requests where id = ${id}`;
  }

  async addRequestPrayer(requestId: string, actor: string) {
    if (!isUuid(requestId)) return false;
    return this.sql.begin(async (tx) => {
      const inserted = await tx`
        insert into request_prayers (request_id, actor) select ${requestId}, ${actor}
        where exists (select 1 from prayer_requests where id = ${requestId})
        on conflict do nothing returning request_id`;
      if (!inserted.length) return false;
      await tx`update prayer_requests set prayed_count = prayed_count + 1 where id = ${requestId}`;
      return true;
    });
  }

  async prayedForRequests(requestIds: string[], actor: string) {
    const ids = requestIds.filter(isUuid);
    if (!ids.length) return new Set<string>();
    const rows = await this.sql`select request_id from request_prayers where actor = ${actor} and request_id = any(${ids}::uuid[])`;
    return new Set(rows.map((r) => r.request_id as string));
  }

  // --- Reports & blocks ---

  async addContentReport(kind: ReportableKind, id: string, actor: string, reason: string) {
    if (!isUuid(id)) return 0;
    const table = kind === "world_prayer" ? "world_prayers" : "prayer_requests";
    return this.sql.begin(async (tx) => {
      const [exists] = await tx`select report_count from ${tx(table)} where id = ${id}`;
      if (!exists) return 0;
      const inserted = await tx`
        insert into content_reports (kind, content_id, actor, reason) values (${kind}, ${id}, ${actor}, ${reason})
        on conflict do nothing returning content_id`;
      if (!inserted.length) return Number(exists.report_count);
      const [row] = await tx`update ${tx(table)} set report_count = report_count + 1 where id = ${id} returning report_count`;
      return Number(row.report_count);
    });
  }

  async addBlock(blockerActor: string, blockedActor: string, label: string) {
    if (blockerActor === blockedActor) return;
    await this.sql`insert into blocks (blocker_actor, blocked_actor, label) values (${blockerActor}, ${blockedActor}, ${label}) on conflict do nothing`;
  }

  async listBlocks(blockerActor: string): Promise<BlockRecord[]> {
    const rows = await this.sql`select * from blocks where blocker_actor = ${blockerActor} order by created_at desc`;
    return rows.map((r) => ({
      id: r.id as string,
      blockerActor: r.blocker_actor as string,
      blockedActor: r.blocked_actor as string,
      label: r.label as string,
      createdAt: iso(r.created_at),
    }));
  }

  async removeBlock(blockerActor: string, id: string) {
    if (isUuid(id)) await this.sql`delete from blocks where blocker_actor = ${blockerActor} and id = ${id}`;
  }

  async blockedActors(blockerActor: string) {
    const rows = await this.sql`select blocked_actor from blocks where blocker_actor = ${blockerActor}`;
    return rows.map((r) => r.blocked_actor as string);
  }

  async isBlocked(blockerActor: string, actors: string[]) {
    if (!actors.length) return false;
    const [row] = await this.sql`select 1 as hit from blocks where blocker_actor = ${blockerActor} and blocked_actor = any(${actors}) limit 1`;
    return Boolean(row);
  }

  // --- Notifications & settings ---

  async createNotification(n: Omit<NotificationRecord, "id" | "createdAt" | "readAt">) {
    const [row] = await this.sql`
      insert into notifications (user_id, kind, title, body, link) values (${n.userId}, ${n.kind}, ${n.title}, ${n.body}, ${n.link})
      returning *`;
    return toNotification(row);
  }

  async listNotifications(userId: string, limit: number) {
    const rows = await this.sql`select * from notifications where user_id = ${userId} order by created_at desc limit ${limit}`;
    return rows.map(toNotification);
  }

  async unreadCount(userId: string) {
    const [row] = await this.sql`select count(*) as n from notifications where user_id = ${userId} and read_at is null`;
    return Number(row.n);
  }

  async markNotificationsRead(userId: string) {
    await this.sql`update notifications set read_at = now() where user_id = ${userId} and read_at is null`;
  }

  async getSettings(userId: string) {
    const [row] = await this.sql`select * from user_settings where user_id = ${userId}`;
    return row ? toSettings(row) : defaultSettings(userId);
  }

  async saveSettings(s: UserSettings) {
    const h = s.home;
    await this.sql`
      insert into user_settings (user_id, home_kind, home_city_id, home_cc, home_name, home_lat, home_lon,
        notify_requests, notify_area, email, push, last_email_at, last_area_notice_at)
      values (${s.userId}, ${h?.kind ?? null}, ${h?.cityId ?? null}, ${h?.cc ?? null}, ${h?.name ?? null}, ${h?.lat ?? null}, ${h?.lon ?? null},
        ${s.notifyRequests}, ${s.notifyArea}, ${s.email}, ${s.push}, ${s.lastEmailAt}, ${s.lastAreaNoticeAt})
      on conflict (user_id) do update set
        home_kind = excluded.home_kind, home_city_id = excluded.home_city_id, home_cc = excluded.home_cc,
        home_name = excluded.home_name, home_lat = excluded.home_lat, home_lon = excluded.home_lon,
        notify_requests = excluded.notify_requests, notify_area = excluded.notify_area, email = excluded.email,
        push = excluded.push, last_email_at = excluded.last_email_at, last_area_notice_at = excluded.last_area_notice_at`;
  }

  async usersWatchingCity(cityId: number) {
    const rows = await this.sql`select * from user_settings where notify_area and home_city_id = ${cityId} limit 1000`;
    return rows.map(toSettings);
  }

  async addPushSubscription(sub: Omit<PushSubscriptionRecord, "id" | "createdAt">) {
    await this.sql`
      insert into push_subscriptions (user_id, kind, endpoint, keys) values (${sub.userId}, ${sub.kind}, ${sub.endpoint}, ${sub.keys})
      on conflict (endpoint) do update set user_id = excluded.user_id, keys = excluded.keys`;
  }

  async listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
    const rows = await this.sql`select * from push_subscriptions where user_id = ${userId}`;
    return rows.map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      kind: r.kind as "web" | "expo",
      endpoint: r.endpoint as string,
      keys: (r.keys as string) ?? null,
      createdAt: iso(r.created_at),
    }));
  }

  async deletePushSubscription(endpoint: string) {
    await this.sql`delete from push_subscriptions where endpoint = ${endpoint}`;
  }
}
