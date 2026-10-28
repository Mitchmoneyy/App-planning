/**
 * Praying for people in places: requests, prayers, blocks, notifications,
 * settings. Runs against every storage back end (Postgres when TEST_DATABASE_URL is set).
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/server/db/memory";
import { PostgresStore } from "@/server/db/postgres";
import { defaultSettings, senderActor, type AreaRef, type NewWorldPrayer, type Store } from "@/server/db/types";

const PG_URL = process.env.TEST_DATABASE_URL;
const backends: [string, () => Promise<Store & { close?(): Promise<void> }>][] = [["memory", async () => new MemoryStore(null)]];
if (PG_URL) {
  backends.push([
    "postgres",
    async () => {
      const sql = postgres(PG_URL, { onnotice: () => {} });
      await sql.unsafe(
        "drop table if exists push_subscriptions, user_settings, notifications, blocks, content_reports, world_prayers, request_prayers, prayer_requests, reviews, favorites, candles, prayer_reports, prayed_for, prayers, sessions, users cascade",
      );
      await sql.unsafe(readFileSync("db/schema.sql", "utf8"));
      await sql.end();
      return new PostgresStore(PG_URL);
    },
  ]);
}

const manila: AreaRef = { kind: "city", cityId: 1701668, cc: "PH", name: "Manila", lat: 14.6, lon: 120.98 };
const saoPaulo: AreaRef = { kind: "city", cityId: 3448439, cc: "BR", name: "São Paulo", lat: -23.55, lon: -46.64 };
const kenya: AreaRef = { kind: "country", cityId: null, cc: "KE", name: "Kenya", lat: 0.2, lon: 37.5 };

const prayer = (over: Partial<NewWorldPrayer> = {}): NewWorldPrayer => ({
  senderDevice: "dev-1",
  senderUser: null,
  body: "Holding you in my heart",
  templateId: null,
  faith: null,
  showFaith: false,
  anonymous: true,
  displayName: null,
  target: manila,
  origin: saoPaulo,
  requestId: null,
  status: "published",
  moderationNote: null,
  ...over,
});

describe.each(backends)("%s store: prayers for places", (_name, make) => {
  let store: Store & { close?(): Promise<void> };
  beforeAll(async () => {
    store = await make();
  });
  afterAll(async () => {
    await store.close?.();
  });

  it("stores rounded areas and lists published prayers by place", async () => {
    const a = await store.createWorldPrayer(prayer());
    expect(a.target).toEqual(manila);
    expect(a.origin).toEqual(saoPaulo);
    await store.createWorldPrayer(prayer({ target: kenya, origin: null }));
    await store.createWorldPrayer(prayer({ status: "pending" }));

    expect((await store.listWorldPrayers({ limit: 10, targetCityId: manila.cityId! })).map((p) => p.id)).toEqual([a.id]);
    const ke = await store.listWorldPrayers({ limit: 10, targetCc: "KE" });
    expect(ke).toHaveLength(1);
    expect(ke[0].origin).toBeNull();
    expect((await store.worldStats()).total).toBe(2);
  });

  it("summarises prayers for an area by where they came from", async () => {
    await store.createWorldPrayer(prayer({ origin: { ...saoPaulo } }));
    await store.createWorldPrayer(prayer({ target: { ...manila, cityId: 999, name: "Quezon City" }, origin: { kind: "country", cityId: null, cc: "US", name: "United States", lat: 39, lon: -98 } }));
    const s = await store.areaSummary(manila.cityId, "PH");
    expect(s.toCity).toBe(2);
    expect(s.toCountry).toBe(3);
    expect(s.fromCountries[0]).toEqual({ cc: "BR", count: 2 });
    expect(s.fromCountries.find((c) => c.cc === "US")?.count).toBe(1);
  });

  it("handles prayer requests: listing, counting once per person, closing", async () => {
    const u = await store.createUser({ email: "req@example.com", displayName: "Rosa", passwordHash: "x" });
    const r = await store.createRequest({
      userId: u.id,
      body: "Please pray for my brother's recovery",
      faith: "christian",
      showFaith: false,
      anonymous: true,
      displayName: "Rosa",
      area: manila,
      visibility: "public",
      status: "published",
      moderationNote: null,
    });
    await store.createRequest({ ...r, userId: u.id, visibility: "unlisted", body: "private-ish", area: manila, status: "published", moderationNote: null });

    expect((await store.listPublicRequests({ limit: 10 })).map((x) => x.id)).toEqual([r.id]);
    expect(await store.listPublicRequests({ limit: 10, cc: "KE" })).toEqual([]);
    expect(await store.addRequestPrayer(r.id, "d:a")).toBe(true);
    expect(await store.addRequestPrayer(r.id, "d:a")).toBe(false);
    expect((await store.getRequest(r.id))!.prayedCount).toBe(1);
    expect([...(await store.prayedForRequests([r.id], "d:a"))]).toEqual([r.id]);

    await store.createWorldPrayer(prayer({ requestId: r.id, body: "Praying for your brother" }));
    expect(await store.listWorldPrayers({ limit: 10, requestId: r.id })).toHaveLength(1);

    await store.updateRequest(r.id, { closed: true });
    expect(await store.listPublicRequests({ limit: 10 })).toEqual([]);
    expect((await store.listOwnRequests(u.id)).length).toBe(2);
  });

  it("reports content once per person", async () => {
    const p = await store.createWorldPrayer(prayer({ body: "spammy" }));
    expect(await store.addContentReport("world_prayer", p.id, "d:x", "spam")).toBe(1);
    expect(await store.addContentReport("world_prayer", p.id, "d:x", "spam")).toBe(1);
    expect(await store.addContentReport("world_prayer", p.id, "d:y", "spam")).toBe(2);
    expect(await store.addContentReport("request", "00000000-0000-0000-0000-000000000000", "d:x", "spam")).toBe(0);
  });

  it("blocks hide a sender's prayers and requests from the blocker", async () => {
    const troll = await store.createWorldPrayer(prayer({ senderDevice: "troll-device", body: "from troll", target: kenya }));
    await store.addBlock("d:me", senderActor(troll), "a prayer for Kenya");
    await store.addBlock("d:me", senderActor(troll), "duplicate is ignored");
    const blocked = await store.blockedActors("d:me");
    expect(blocked).toEqual(["d:troll-device"]);
    const visible = await store.listWorldPrayers({ limit: 50, targetCc: "KE", excludeActors: blocked });
    expect(visible.some((p) => p.id === troll.id)).toBe(false);
    expect(await store.isBlocked("d:me", ["d:troll-device", "u:other"])).toBe(true);

    const [b] = await store.listBlocks("d:me");
    expect(b.label).toBe("a prayer for Kenya");
    await store.removeBlock("d:me", b.id);
    expect(await store.blockedActors("d:me")).toEqual([]);
  });

  it("keeps notifications and settings per user", async () => {
    const u = await store.createUser({ email: "note@example.com", displayName: "Noor", passwordHash: "x" });
    expect(await store.getSettings(u.id)).toEqual(defaultSettings(u.id));

    await store.saveSettings({ ...defaultSettings(u.id), home: manila, notifyArea: true, email: true });
    expect((await store.getSettings(u.id)).home).toEqual(manila);
    expect((await store.usersWatchingCity(manila.cityId!)).map((s) => s.userId)).toEqual([u.id]);

    await store.createNotification({ userId: u.id, kind: "request_prayed", title: "Someone in Brazil prayed for you", body: "…", link: "/world" });
    expect(await store.unreadCount(u.id)).toBe(1);
    expect((await store.listNotifications(u.id, 10))[0].title).toMatch(/Brazil/);
    await store.markNotificationsRead(u.id);
    expect(await store.unreadCount(u.id)).toBe(0);

    await store.addPushSubscription({ userId: u.id, kind: "web", endpoint: "https://push.example/abc", keys: '{"p256dh":"x","auth":"y"}' });
    await store.addPushSubscription({ userId: u.id, kind: "web", endpoint: "https://push.example/abc", keys: '{"p256dh":"z","auth":"y"}' });
    const subs = await store.listPushSubscriptions(u.id);
    expect(subs).toHaveLength(1);
    expect(subs[0].keys).toContain("z");
    await store.deletePushSubscription("https://push.example/abc");
    expect(await store.listPushSubscriptions(u.id)).toEqual([]);
  });

  it("moves anonymous world activity to the account and deletes it with the account", async () => {
    const u = await store.createUser({ email: "move@example.com", displayName: "Mo", passwordHash: "x" });
    await store.createWorldPrayer(prayer({ senderDevice: "dev-mo", body: "sent before signing up" }));
    await store.addBlock("d:dev-mo", "d:someone", "a prayer");
    await store.mergeDeviceIntoUser("dev-mo", u.id);

    const mine = await store.listOwnWorldPrayers({ deviceId: "new-device", userId: u.id });
    expect(mine.map((p) => p.body)).toEqual(["sent before signing up"]);
    expect(await store.blockedActors(`u:${u.id}`)).toEqual(["d:someone"]);

    await store.deleteUser(u.id, "dev-mo");
    expect(await store.listOwnWorldPrayers({ deviceId: "dev-mo", userId: u.id })).toEqual([]);
    expect(await store.blockedActors(`u:${u.id}`)).toEqual([]);
  });
});
