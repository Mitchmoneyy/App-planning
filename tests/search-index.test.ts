import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { writeSearchIndex } from "../pipeline/lib/search-index.mjs";
import { searchWords } from "@/lib/searchText";

const place = (id: string, name: string, faith: string, lat: number, lon: number) => ({ id, name, faith, lat, lon, city: "Town", cc: "GB" });

describe("search words", () => {
  it("drops common words and keeps every script", () => {
    expect(searchWords("Church of St. Patrick & Mary")).toEqual(["patrick", "mary"]);
    expect(searchWords("Église Saint-Sulpice")).toEqual(["sulpice"]);
    expect(searchWords("श्री स्वामीनारायण मंदिर").length).toBe(3);
    expect(searchWords("St Mary's Church")).toEqual(["mary"]);
  });
});

describe("search index", () => {
  let searchIndex: typeof import("@/server/searchIndex").searchIndex;
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "gs-idx-"));
    const places = [
      place("a", "St Patrick's Cathedral", "christianity", 53.34, -6.27),
      place("b", "St Patrick's Church", "christianity", 51.5, -0.1),
      place("c", "Southall Gurdwara", "sikhism", 51.51, -0.38),
      place("d", "Masjid Patrick Road", "islam", 51.0, 0.0),
      ...Array.from({ length: 30_000 }, (_, i) => place(`p${i}`, `Paterson Chapel ${i}`, "christianity", 40, -74)),
    ];
    const res = writeSearchIndex(places, join(dir, "search.idx"), { detail: () => "Town" });
    expect(res.places).toBe(places.length);
    process.env.PLACES_SEARCH_URL = join(dir, "search.idx");
    ({ searchIndex } = await import("@/server/searchIndex"));
  });

  it("finds places by the start of their words", async () => {
    expect((await searchIndex("gurdw southall", null, null)).map((h) => h.id)).toEqual(["c"]);
    expect((await searchIndex("patrick", null, null)).map((h) => h.id).sort()).toEqual(["a", "b", "d"]);
  });

  it("filters by faith and prefers nearby places", async () => {
    expect((await searchIndex("patrick", "islam", null)).map((h) => h.id)).toEqual(["d"]);
    const near = await searchIndex("patrick", "christianity", { lat: 51.5, lon: -0.1 });
    expect(near[0].id).toBe("b");
  });

  it("splits busy prefixes into smaller pieces", async () => {
    // 30k "paterson" words overflow the "pa" piece, so "pat…" lives in its own piece.
    expect((await searchIndex("patrick cathedral", null, null))[0].id).toBe("a");
    expect((await searchIndex("paterson 29999", null, null)).length).toBeGreaterThan(0);
  });
});
