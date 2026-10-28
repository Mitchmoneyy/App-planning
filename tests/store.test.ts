/**
 * The same behaviour tests run against every storage back end.
 * Postgres runs only when TEST_DATABASE_URL is set (it wipes the tables!).
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/server/db/memory";
import { PostgresStore } from "@/server/db/postgres";
import { actorKey, DuplicateError, type NewPrayer, type Store } from "@/server/db/types";

const PG_URL = process.env.TEST_DATABASE_URL;

const backends: [string, () => Promise<Store & { close?(): Promise<void> }>][] = [["memory", async () => new MemoryStore(null)]];
if (PG_URL) {
  backends.push([
    "postgres",
    async () => {
      const sql = postgres(PG_URL, { onnotice: () => {} });
      await sql.unsafe("drop table if exists place_suggestions, reviews, favorites, candles, prayer_reports, prayed_for, prayers, sessions, users cascade");
      await sql.unsafe(readFileSync("db/schema.sql", "utf8"));
      await sql.end();
      return new PostgresStore(PG_URL);
    },
  ]);
}

const prayer = (over: Partial<NewPrayer> = {}): NewPrayer => ({
  placeId: "hagia-sophia",
  ownerDevice: "device-a",
  ownerUser: null,
  body: "Peace for my family",
  isPublic: true,
  anonymous: true,
  displayName: null,
  status: "published",
  moderationNote: null,
  ...over,
});

describe.each(backends)("%s store", (_name, make) => {
  let store: Store & { close?(): Promise<void> };
  beforeAll(async () => {
    store = await make();
  });
  afterAll(async () => {
    await store.close?.();
  });

  it("lights candles and counts them", async () => {
    expect(await store.getPlaceStats("kinkaku-ji")).toEqual({ candles: 0, candlesToday: 0, prayers: 0 });
    expect(await store.lastCandleAt("kinkaku-ji", "d:x")).toBeNull();
    await store.lightCandle("kinkaku-ji", "d:x");
    await store.lightCandle("kinkaku-ji", "d:y");
    const stats = await store.getPlaceStats("kinkaku-ji");
    expect(stats.candles).toBe(2);
    expect(stats.candlesToday).toBe(2);
    expect(await store.lastCandleAt("kinkaku-ji", "d:x")).toBeInstanceOf(Date);
  });

  it("records which gesture was offered", async () => {
    await store.lightCandle("blue-mosque", "d:z", "dua");
    expect((await store.getPlaceStats("blue-mosque")).candles).toBe(1);
  });

  it("queues place suggestions for moderators", async () => {
    const s = await store.createSuggestion({
      kind: "new", placeId: null, name: "St Brigid's Chapel", faith: "christianity", tradition: null, address: "Main St",
      lat: 53.3, lon: -6.2, website: null, note: "Small village chapel", ownerUser: null, ownerDevice: "device-a",
    });
    expect(s.status).toBe("pending");
    expect((await store.listPendingSuggestions()).map((x) => x.id)).toContain(s.id);
    await store.setSuggestionStatus(s.id, "approved", "Checked");
    expect((await store.listPendingSuggestions()).map((x) => x.id)).not.toContain(s.id);
  });

  it("shows only published prayers on the wall, newest first, with paging", async () => {
    const a = await store.createPrayer(prayer({ body: "first" }));
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.createPrayer(prayer({ body: "second" }));
    await store.createPrayer(prayer({ body: "held", status: "pending" }));
    await store.createPrayer(prayer({ body: "mine only", status: "private", isPublic: false }));

    const wall = await store.listPublicPrayers("hagia-sophia", 10);
    expect(wall.map((p) => p.body)).toEqual(["second", "first"]);
    const page2 = await store.listPublicPrayers("hagia-sophia", 10, b.createdAt);
    expect(page2.map((p) => p.id)).toEqual([a.id]);

    // Rejected prayers don't count; everything else does.
    await store.createPrayer(prayer({ status: "rejected" }));
    expect((await store.getPlaceStats("hagia-sophia")).prayers).toBe(4);
  });

  it("counts 'I prayed for this' once per person", async () => {
    const p = await store.createPrayer(prayer({ placeId: "wat-arun" }));
    expect(await store.addPrayedFor(p.id, "d:1")).toBe(true);
    expect(await store.addPrayedFor(p.id, "d:1")).toBe(false);
    expect(await store.addPrayedFor(p.id, "d:2")).toBe(true);
    expect((await store.getPrayer(p.id))!.prayedCount).toBe(2);
    expect([...(await store.prayedForSet([p.id], "d:1"))]).toEqual([p.id]);
    expect((await store.prayedForSet([p.id], "d:3")).size).toBe(0);
  });

  it("counts reports once per person", async () => {
    const p = await store.createPrayer(prayer({ placeId: "wat-pho" }));
    expect(await store.addReport(p.id, "d:1", "spam")).toBe(1);
    expect(await store.addReport(p.id, "d:1", "spam")).toBe(1);
    expect(await store.addReport(p.id, "d:2", "spam")).toBe(2);
    await store.setPrayerStatus(p.id, "hidden", "reports");
    const queue = await store.listModerationQueue();
    expect(queue.prayers.some((q) => q.id === p.id)).toBe(true);
  });

  it("handles unknown ids gracefully", async () => {
    expect(await store.getPrayer("not-a-uuid")).toBeNull();
    expect(await store.addPrayedFor("00000000-0000-0000-0000-000000000000", "d:1")).toBe(false);
    expect(await store.addReport("00000000-0000-0000-0000-000000000000", "d:1", "spam")).toBe(0);
  });

  it("saves favorites per actor", async () => {
    await store.setFavorite("d:fav", "borobudur", true);
    await store.setFavorite("d:fav", "borobudur", true);
    await store.setFavorite("d:fav", "jokhang", true);
    expect((await store.listFavorites("d:fav")).sort()).toEqual(["borobudur", "jokhang"]);
    await store.setFavorite("d:fav", "jokhang", false);
    expect(await store.listFavorites("d:fav")).toEqual(["borobudur"]);
  });

  it("creates users, rejects duplicates, and manages sessions", async () => {
    const u = await store.createUser({ email: "ana@example.com", displayName: "Ana", passwordHash: "x" });
    await expect(store.createUser({ email: "ana@example.com", displayName: "Ana 2", passwordHash: "y" })).rejects.toBeInstanceOf(DuplicateError);
    expect((await store.getUserByEmail("ana@example.com"))!.id).toBe(u.id);

    await store.createSession("tok1", u.id, new Date(Date.now() + 60_000));
    await store.createSession("tok-old", u.id, new Date(Date.now() - 60_000));
    expect(await store.getSessionUser("tok1")).toBe(u.id);
    expect(await store.getSessionUser("tok-old")).toBeNull();
    await store.deleteSession("tok1");
    expect(await store.getSessionUser("tok1")).toBeNull();
  });

  it("moves anonymous activity onto an account at sign-in", async () => {
    const u = await store.createUser({ email: "ben@example.com", displayName: "Ben", passwordHash: "x" });
    const who = { deviceId: "device-ben", userId: null };
    const p = await store.createPrayer(prayer({ placeId: "meiji-shrine", ownerDevice: "device-ben", status: "private", isPublic: false }));
    await store.setFavorite(actorKey(who), "meiji-shrine", true);
    await store.setFavorite(`u:${u.id}`, "meiji-shrine", true); // already saved on the account too
    await store.lightCandle("meiji-shrine", actorKey(who));

    await store.mergeDeviceIntoUser("device-ben", u.id);

    const signedIn = { deviceId: "another-device", userId: u.id };
    expect((await store.listOwnPrayers(signedIn)).map((x) => x.id)).toEqual([p.id]);
    expect(await store.listFavorites(`u:${u.id}`)).toEqual(["meiji-shrine"]);
    expect(await store.listFavorites(actorKey(who))).toEqual([]);
    expect(await store.lastCandleAt("meiji-shrine", `u:${u.id}`)).not.toBeNull();
  });

  it("stores one review per user, with summary and moderation", async () => {
    const u = await store.createUser({ email: "cy@example.com", displayName: "Cy", passwordHash: "x" });
    const v = await store.createUser({ email: "di@example.com", displayName: "Di", passwordHash: "x" });
    const base = { placeId: "lotus-temple", displayName: "Cy", body: "Peaceful and beautiful.", moderationNote: null };
    await store.upsertReview({ ...base, userId: u.id, rating: 4, status: "published" });
    const updated = await store.upsertReview({ ...base, userId: u.id, rating: 5, status: "published" });
    await store.upsertReview({ ...base, userId: v.id, displayName: "Di", rating: 3, status: "published" });
    const held = await store.upsertReview({ ...base, placeId: "lotus-temple-2", userId: v.id, rating: 1, status: "pending" });

    expect((await store.listReviews("lotus-temple")).length).toBe(2);
    expect(await store.getReviewSummary("lotus-temple")).toEqual({ count: 2, average: 4 });
    expect((await store.getUserReview("lotus-temple", u.id))!.id).toBe(updated.id);
    expect((await store.listModerationQueue()).reviews.map((r) => r.id)).toContain(held.id);

    await store.setReviewStatus(held.id, "published");
    expect((await store.listReviews("lotus-temple-2")).length).toBe(1);
    await store.deleteReview("lotus-temple", u.id);
    expect(await store.getReviewSummary("lotus-temple")).toEqual({ count: 1, average: 3 });
  });

  it("deletes an account and everything it owns, keeping candle counts", async () => {
    const u = await store.createUser({ email: "del@example.com", displayName: "Del", passwordHash: "x" });
    await store.createPrayer(prayer({ placeId: "ise-grand-shrine", ownerDevice: "dev-del", ownerUser: u.id }));
    await store.setFavorite(`u:${u.id}`, "ise-grand-shrine", true);
    await store.lightCandle("ise-grand-shrine", `u:${u.id}`);
    await store.createSession("tok-del", u.id, new Date(Date.now() + 60_000));

    await store.deleteUser(u.id, "dev-del");

    expect(await store.getUserById(u.id)).toBeNull();
    expect(await store.getSessionUser("tok-del")).toBeNull();
    expect(await store.listOwnPrayers({ deviceId: "dev-del", userId: u.id })).toEqual([]);
    expect(await store.listFavorites(`u:${u.id}`)).toEqual([]);
    expect((await store.getPlaceStats("ise-grand-shrine")).candles).toBe(1);
  });
});
