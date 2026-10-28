import { describe, expect, it } from "vitest";
import { BLESSINGS, blessingText, FAITH_OPTIONS, isFaithOption } from "@/lib/blessings";
import { ambienceFor } from "@/lib/ambience";
import { formatLocalTime, timeZoneAt } from "@/lib/localTime";
import { bearing } from "@/server/immersive";
import { localCheck } from "@/server/moderation";
import { describeSymbol } from "@/server/weather";

describe("moderation: respect between faiths", () => {
  it("allows prayers and blessings from every tradition", () => {
    for (const b of BLESSINGS) expect(localCheck(blessingText(b.id, "Manila")!).decision).toBe("approve");
    expect(localCheck("Allahu akbar, may Allah protect the people of Gaza").decision).toBe("approve");
    expect(localCheck("Jesus, please comfort my neighbours tonight").decision).toBe("approve");
  });

  it("holds attacks on other faiths and pressure to convert for review", () => {
    for (const text of [
      "Your religion is false, convert or burn in hell",
      "Pray to the one true God, not your false gods",
      "You infidels need to repent and accept the truth",
      "Hindus are idol worshippers",
    ]) {
      expect(localCheck(text).decision, text).toBe("review");
    }
  });
});

describe("blessings and faith options", () => {
  it("covers many traditions and fills in the place name", () => {
    const traditions = new Set(BLESSINGS.map((b) => b.tradition));
    expect(traditions.size).toBeGreaterThanOrEqual(8);
    expect(blessingText("strength", "Manila")).toContain("Manila");
    expect(blessingText("nope", "x")).toBeNull();
  });

  it("validates optional faith choices", () => {
    expect(FAITH_OPTIONS.map((f) => f.key)).toContain("bahai");
    expect(isFaithOption("buddhist")).toBe(true);
    expect(isFaithOption("prefer-not")).toBe(false);
  });
});

describe("immersive helpers", () => {
  it("faces Street View toward the building", () => {
    expect(Math.round(bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) % 360)).toBe(0); // north
    expect(Math.round(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) % 360)).toBe(90); // east
  });

  it("knows local time zones", () => {
    expect(timeZoneAt(48.853, 2.35)).toBe("Europe/Paris");
    expect(timeZoneAt(35.04, 135.73)).toBe("Asia/Tokyo");
    expect(formatLocalTime("Asia/Tokyo", new Date("2026-01-01T00:00:00Z"))).toMatch(/9:00/);
  });

  it("describes weather symbols", () => {
    expect(describeSymbol("partlycloudy_day").summary).toBe("Partly cloudy");
    expect(describeSymbol("lightrainshowers_night").summary).toBe("Rain");
    expect(describeSymbol("clearsky_night").icon).toBe("🌙");
  });

  it("offers ambient sounds that suit each place", () => {
    expect(ambienceFor("christianity")).toContain("organ");
    expect(ambienceFor("islam")).toEqual(["quiet"]);
    expect(ambienceFor("buddhism")).toContain("bowl");
  });
});
