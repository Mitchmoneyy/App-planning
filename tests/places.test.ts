import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import { readFile } from "node:fs/promises";
import vtpbf from "vt-pbf";
import { describe, expect, it } from "vitest";
import { faithFromName, fromOsm, fromOverture } from "../pipeline/lib/faith.mjs";
import { PMTilesWriter } from "../pipeline/lib/pmtiles-writer.mjs";
import { etiquetteFor } from "@/lib/etiquette";
import { gesturesFor } from "@/lib/gestures";
import { parseQuery } from "@/server/search";
import { tileOfId } from "@/server/tiles";

describe("faith normalisation", () => {
  it("maps Overture categories and keeps denominations", () => {
    expect(fromOverture("roman_catholic_place_of_worship", "St Mary", "US")).toEqual({ faith: "christianity", tradition: "Catholic" });
    expect(fromOverture("muslim_place_of_worship", "Masjid Al-Noor", "GB")).toEqual({ faith: "islam", tradition: null });
  });
  it("trusts a clear name over Overture's Christian catch-all", () => {
    expect(fromOverture("christian_place_of_worship", "Gurdwara Sahib Leamington", "GB").faith).toBe("sikhism");
    expect(fromOverture("christian_place_of_worship", "Grace Baptist Church", "US").faith).toBe("christianity");
  });
  it("reads names in many languages", () => {
    expect(faithFromName("Süleymaniye Camii", "TR")).toBe("islam");
    expect(faithFromName("Shri Swaminarayan Mandir", "GB")).toBe("hinduism");
    expect(faithFromName("Wat Pho", "TH")).toBe("buddhism");
    expect(faithFromName("Fushimi Inari Taisha", "JP")).toBe("shinto");
    expect(faithFromName("Iglesia de San Francisco", "MX")).toBe("christianity");
    expect(faithFromName("Temple Emanu-El", "US")).toBe("judaism");
  });
  it("uses the country for a plain 'temple'", () => {
    expect(faithFromName("Kiyomizu Temple", "JP")).toBe("buddhism");
    expect(faithFromName("Old Temple", "IN")).toBe("hinduism");
  });
  it("maps OSM religion and denomination tags", () => {
    expect(fromOsm({ religion: "muslim", denomination: "sunni", name: "x" }, "EG")).toEqual({ faith: "islam", tradition: "Sunni" });
    expect(fromOsm({ religion: "christian", denomination: "greek_orthodox" }, "GR")).toEqual({ faith: "christianity", tradition: "Greek Orthodox" });
    expect(fromOsm({ religion: "taoist" }, "TW").faith).toBe("chinese");
  });
});

describe("devotional gestures", () => {
  const kinds = (faith: string, tradition?: string | null) => gesturesFor(faith, tradition).map((g) => g.kind);
  it("never offers a flame where it isn't the custom", () => {
    for (const faith of ["islam", "sikhism", "zoroastrianism", "bahai"]) {
      expect(kinds(faith)).not.toContain("candle");
      expect(kinds(faith)).not.toContain("diya");
      expect(kinds(faith)).not.toContain("incense");
    }
    expect(kinds("islam")).toEqual(["dua"]);
  });
  it("matches church tradition", () => {
    expect(kinds("christianity", "Catholic")[0]).toBe("candle");
    expect(kinds("christianity", "Baptist")).toEqual(["prayer"]);
    expect(kinds("christianity", null)).toEqual(["prayer", "candle"]);
  });
  it("fits other traditions", () => {
    expect(kinds("hinduism")).toEqual(["diya", "flowers"]);
    expect(kinds("buddhism", "Tibetan")[0]).toBe("butter-lamp");
    expect(kinds("shinto")).toEqual(["ema"]);
  });
  it("has etiquette for every faith, with a safe default", () => {
    expect(etiquetteFor("islam").shoes).toMatch(/shoes/i);
    expect(etiquetteFor("unknown").conduct.length).toBeGreaterThan(0);
  });
});

describe("search queries", () => {
  it("turns faith words into a filter", () => {
    expect(parseQuery("mosques in Istanbul")).toEqual({ text: "istanbul", faith: "islam" });
    expect(parseQuery("Gurdwara near London")).toEqual({ text: "london", faith: "sikhism" });
    expect(parseQuery("Notre-Dame")).toEqual({ text: "notre-dame", faith: null });
  });
});

describe("place ids", () => {
  it("carry their street-level tile", () => {
    expect(tileOfId("2k1-1a3-9f3c2b")).toEqual({ x: parseInt("2k1", 36), y: parseInt("1a3", 36) });
    expect(tileOfId("notre-dame-de-paris")).toBeNull();
    expect(tileOfId("zzzz-0-abc")).toBeNull(); // outside the zoom-12 grid
  });
});

class FileSource implements Source {
  constructor(private path: string) {}
  getKey() {
    return this.path;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const buf = (await readFile(this.path)).subarray(offset, offset + length);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer };
  }
}

describe("PMTiles writer", () => {
  it("writes tiles that the standard reader can read back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gs-pm-"));
    const writer = new PMTilesWriter(join(dir, "t.tmp"));
    const tile = (name: string) =>
      gzipSync(Buffer.from(vtpbf.fromGeojsonVt({ places: { features: [{ type: 1, geometry: [[100, 200]], tags: { id: name, name, faith: "islam" } }] } }, { version: 2, extent: 4096 })));
    // Enough tiles to need leaf directories.
    for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) writer.add(6, x, y, tile(`p${x}-${y}`));
    writer.add(0, 0, 0, tile("world"));
    writer.finish(join(dir, "t.pmtiles"), { minZoom: 0, maxZoom: 6, metadata: { name: "test" } });

    const pm = new PMTiles(new FileSource(join(dir, "t.pmtiles")));
    const header = await pm.getHeader();
    expect(header.maxZoom).toBe(6);
    expect(header.numAddressedTiles).toBe(64 * 64 + 1);
    for (const [z, x, y, name] of [[0, 0, 0, "world"], [6, 5, 9, "p5-9"], [6, 63, 63, "p63-63"]] as const) {
      const got = await pm.getZxy(z, x, y);
      const vt = new VectorTile(new Protobuf(new Uint8Array(got!.data)));
      expect(vt.layers.places.feature(0).properties.name).toBe(name);
    }
    expect(await pm.getZxy(5, 0, 0)).toBeUndefined();
    expect((await pm.getMetadata()) as { name: string }).toMatchObject({ name: "test" });
  });
});
