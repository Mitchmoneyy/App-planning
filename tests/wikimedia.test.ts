/**
 * Wikipedia / Wikidata / Commons integration, with the network mocked using
 * responses shaped like the real APIs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatWikidataTime, getPlaceInfo, pickSections, stripHtml, toPhoto, trimToSentence } from "@/server/wikimedia";
import type { Place } from "@/lib/types";

describe("parsing helpers", () => {
  it("formats Wikidata dates by precision", () => {
    expect(formatWikidataTime({ time: "+1163-00-00T00:00:00Z", precision: 9 })).toBe("1163");
    expect(formatWikidataTime({ time: "+1880-00-00T00:00:00Z", precision: 8 })).toBe("1880s");
    expect(formatWikidataTime({ time: "+1200-00-00T00:00:00Z", precision: 7 })).toBe("12th century");
    expect(formatWikidataTime({ time: "+0021-00-00T00:00:00Z", precision: 7 })).toBe("1st century");
    expect(formatWikidataTime({ time: "-0300-00-00T00:00:00Z", precision: 9 })).toBe("300 BCE");
  });

  it("picks history and architecture sections and skips reference lists", () => {
    const extract =
      "Intro text.\n\n== History ==\nThe first church was built in 1163 on the site of an older basilica, and work continued for nearly two centuries.\n\n=== Middle Ages ===\nMore history here that is long enough to keep.\n\n== See also ==\nOther cathedrals and a long list that should not be shown at all in the app.\n\n== Architecture ==\nIt is a celebrated example of French Gothic architecture, with flying buttresses and rose windows.\n";
    const sections = pickSections(extract);
    expect(sections.map((s) => s.heading)).toEqual(["History", "Architecture"]);
    expect(sections[0].text).not.toContain("===");
  });

  it("trims long text at a sentence end", () => {
    const text = "One sentence here. Another sentence follows. " + "x".repeat(100);
    expect(trimToSentence(text, 50)).toBe("One sentence here. Another sentence follows.");
  });

  it("strips HTML from Commons metadata", () => {
    expect(stripHtml('<a href="//commons">Jane &amp; Co</a>')).toBe("Jane & Co");
    expect(stripHtml(undefined)).toBeNull();
  });

  it("keeps only usable, licensed photos", () => {
    const page = {
      title: "File:Notre Dame Paris.jpg",
      imageinfo: [
        {
          thumburl: "https://upload.wikimedia.org/x/thumb/a/ab/Notre.jpg/1024px-Notre.jpg",
          thumbwidth: 1024,
          thumbheight: 683,
          descriptionurl: "https://commons.wikimedia.org/wiki/File:Notre.jpg",
          mime: "image/jpeg",
          width: 4000,
          height: 2667,
          extmetadata: {
            Artist: { value: '<a href="//x">Jane Doe</a>' },
            LicenseShortName: { value: "CC BY-SA 4.0" },
            LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
          },
        },
      ],
    };
    const photo = toPhoto(page)!;
    expect(photo).toMatchObject({ author: "Jane Doe", license: "CC BY-SA 4.0", title: "Notre Dame Paris" });
    expect(photo.thumbUrl).toContain("/400px-");
    expect(toPhoto({ ...page, imageinfo: [{ ...page.imageinfo[0], mime: "image/svg+xml" }] })).toBeNull();
    expect(toPhoto({ ...page, imageinfo: [{ ...page.imageinfo[0], width: 200 }] })).toBeNull();
  });
});

describe("getPlaceInfo", () => {
  afterEach(() => vi.unstubAllGlobals());

  const place: Place = {
    id: "test-cathedral",
    name: "Test Cathedral",
    faith: "christianity",
    tradition: "Catholic",
    city: "Paris",
    country: "France",
    heritage: true,
    website: null,
    wikipedia: "Notre-Dame de Paris",
    wikidata: null,
    lat: 48.85,
    lon: 2.35,
  };

  it("combines Wikipedia, Wikidata and Commons", async () => {
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- second arg is inspected via mock.calls
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/page/summary/")) {
        return json({
          type: "standard",
          title: "Notre-Dame de Paris",
          description: "medieval Catholic cathedral in Paris, France",
          extract: "Notre-Dame de Paris is a medieval Catholic cathedral.",
          wikibase_item: "Q2981",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Notre-Dame_de_Paris" } },
        });
      }
      if (url.includes("prop=extracts")) {
        return json({ query: { pages: [{ extract: "Intro\n\n== History ==\n" + "Construction began in 1163 under Bishop Maurice de Sully. ".repeat(3) }] } });
      }
      if (url.includes("Special:EntityData/Q2981")) {
        return json({
          entities: {
            Q2981: {
              claims: {
                P571: [{ mainsnak: { datavalue: { type: "time", value: { time: "+1163-00-00T00:00:00Z", precision: 9 } } } }],
                P149: [{ mainsnak: { datavalue: { type: "wikibase-entityid", value: { id: "Q176483" } } } }],
                P856: [{ mainsnak: { datavalue: { type: "string", value: "https://www.notredamedeparis.fr/" } } }],
                P373: [{ mainsnak: { datavalue: { type: "string", value: "Notre-Dame de Paris" } } }],
                P18: [{ mainsnak: { datavalue: { type: "string", value: "Notre Dame.jpg" } } }],
              },
            },
          },
        });
      }
      if (url.includes("wbgetentities")) {
        return json({ entities: { Q176483: { labels: { en: { value: "French Gothic architecture" } } } } });
      }
      if (url.includes("commons.wikimedia.org")) {
        return json({
          query: {
            pages: [
              {
                title: "File:Notre Dame.jpg",
                imageinfo: [
                  {
                    thumburl: "https://upload.wikimedia.org/a/1024px-Notre_Dame.jpg",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:Notre_Dame.jpg",
                    mime: "image/jpeg",
                    width: 3000,
                    height: 2000,
                    extmetadata: { Artist: { value: "Someone" }, LicenseShortName: { value: "CC BY 2.0" } },
                  },
                ],
              },
            ],
          },
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const info = await getPlaceInfo(place);
    expect(info.available).toBe(true);
    expect(info.summary).toContain("medieval Catholic cathedral");
    expect(info.wikidataId).toBe("Q2981");
    expect(info.facts).toEqual([
      { label: "Founded", value: "1163" },
      { label: "Architectural style", value: "French Gothic architecture" },
    ]);
    expect(info.website).toBe("https://www.notredamedeparis.fr/");
    expect(info.sections[0].heading).toBe("History");
    expect(info.photos).toHaveLength(1);
    expect(info.photos[0].license).toBe("CC BY 2.0");
    // Wikimedia asks clients to identify themselves.
    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/GlobalSanctuary/);
  });

  it("returns an empty result when Wikimedia is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const info = await getPlaceInfo({ ...place, id: "offline-place" });
    expect(info.available).toBe(false);
    expect(info.photos).toEqual([]);
  });
});
