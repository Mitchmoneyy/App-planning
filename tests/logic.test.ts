import { describe, expect, it } from "vitest";
import { localCheck } from "@/server/moderation";
import { hashPassword, openText, sealText, verifyPassword } from "@/server/security";
import { estimateTrip, lodgingFor, oneWayFare } from "@/lib/travel";
import { searchPlaces } from "@/lib/search";
import type { Place } from "@/lib/types";

describe("moderation: built-in rules", () => {
  it("approves ordinary prayers, including grief and doubt", () => {
    for (const text of [
      "Please watch over my mother during her surgery tomorrow.",
      "I'm angry and I don't understand why you took him from us. Help me find peace.",
      "Thank you for this beautiful day 🙏",
      "Que Dios bendiga a mi familia.",
    ]) {
      expect(localCheck(text).decision).toBe("approve");
    }
  });

  it("rejects links and contact details", () => {
    expect(localCheck("visit www.cheap-pills.com now").decision).toBe("reject");
    expect(localCheck("see https://example.org").decision).toBe("reject");
    expect(localCheck("email me at ana@example.com").decision).toBe("reject");
    expect(localCheck("call +1 (555) 123-4567").decision).toBe("reject");
    expect(localCheck("text 07700 900123").decision).toBe("reject");
    // Dates and years are fine.
    expect(localCheck("He served from 1990-2020, bless him").decision).toBe("approve");
  });

  it("holds possible self-harm for a person and flags support", () => {
    const r = localCheck("I want to end my life, please pray for me");
    expect(r.decision).toBe("review");
    expect(r.selfHarm).toBe(true);
  });

  it("holds profanity for review", () => {
    expect(localCheck("this shit is hard").decision).toBe("review");
  });
});

describe("security helpers", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("encrypts private text when a key is configured", () => {
    delete process.env.PRAYER_ENCRYPTION_KEY;
    expect(sealText("hello")).toBe("hello");

    process.env.PRAYER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const sealed = sealText("a private prayer");
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("private");
    expect(openText(sealed)).toBe("a private prayer");
    expect(sealText("a private prayer")).not.toBe(sealed); // random IV
    delete process.env.PRAYER_ENCRYPTION_KEY;
  });
});

describe("travel estimates", () => {
  const chicago = { lat: 41.88, lon: -87.63 };

  it("suggests driving nearby and flying far away", () => {
    const near = estimateTrip(chicago, { lat: 42.07, lon: -87.68 }, "United States"); // Wilmette
    expect(near.mode).toBe("local");
    expect(near.flight).toBeNull();

    const mid = estimateTrip(chicago, { lat: 38.64, lon: -90.26 }, "United States"); // St. Louis
    expect(mid.mode).toBe("drive-or-fly");
    expect(mid.drive && mid.flight).toBeTruthy();

    const far = estimateTrip(chicago, { lat: 41.9, lon: 12.45 }, "Vatican City"); // Rome
    expect(far.mode).toBe("fly");
    expect(far.drive).toBeNull();
    expect(far.flight!.roundTripFare.low).toBeGreaterThan(600);
    expect(far.flight!.roundTripFare.high).toBeLessThan(2500);
  });

  it("has fares that grow with distance but taper", () => {
    expect(oneWayFare(500)).toBeLessThan(oneWayFare(5000));
    expect(oneWayFare(10000) / 10000).toBeLessThan(oneWayFare(500) / 500);
  });

  it("knows lodging tiers and has a fallback", () => {
    expect(lodgingFor("Switzerland").perNight.low).toBeGreaterThan(lodgingFor("India").perNight.high);
    expect(lodgingFor("Atlantis").tier).toBe("Typical cost");
  });
});

describe("search", () => {
  const place = (name: string, city: string, country: string): Place => ({
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    city,
    country,
    faith: "christianity",
    tradition: null,
    heritage: false,
    website: null,
    wikipedia: null,
    wikidata: null,
    lat: 0,
    lon: 0,
  });
  const places = [place("Mosque–Cathedral of Córdoba", "Córdoba", "Spain"), place("Seville Cathedral", "Seville", "Spain")];

  it("matches without accents and groups countries", () => {
    const results = searchPlaces(places, "cordoba");
    expect(results[0].label).toBe("Córdoba");
    expect(results.some((r) => r.kind === "place")).toBe(true);
    const spain = searchPlaces(places, "spain");
    expect(spain[0]).toMatchObject({ kind: "country", label: "Spain" });
  });
});
