/**
 * Background, history, key facts and photos for a place, from Wikipedia,
 * Wikidata and Wikimedia Commons (free APIs, no key).
 *
 * Results are cached in memory for a day, and the API route also lets the
 * CDN cache them, so each place is fetched rarely.
 *
 * Licensing: Wikipedia text is CC BY-SA 4.0 (credit + link required),
 * Wikidata is CC0, and each Commons photo has its own license and author,
 * which we keep and show next to the photo.
 */
import "server-only";
import type { Place } from "@/lib/types";

const CONTACT = process.env.WIKIMEDIA_CONTACT || "https://github.com/Mitchmoneyy/App-planning";
const HEADERS = { "User-Agent": `GlobalSanctuary/0.1 (${CONTACT})`, "Api-User-Agent": `GlobalSanctuary/0.1 (${CONTACT})` };

export interface Photo {
  url: string; // sized for display (~1024px wide)
  thumbUrl: string; // ~400px wide
  width: number;
  height: number;
  title: string;
  description: string | null;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string; // Commons file page
}

export interface HistorySection {
  heading: string;
  text: string;
}

export interface PlaceInfo {
  available: boolean;
  summary: string | null;
  description: string | null;
  sections: HistorySection[];
  facts: { label: string; value: string }[];
  website: string | null;
  address: string | null;
  photos: Photo[];
  wikipediaUrl: string | null;
  wikipediaTitle: string | null;
  wikidataId: string | null;
}

const EMPTY: PlaceInfo = {
  available: false,
  summary: null,
  description: null,
  sections: [],
  facts: [],
  website: null,
  address: null,
  photos: [],
  wikipediaUrl: null,
  wikipediaTitle: null,
  wikidataId: null,
};

// --- Small fetch helper -------------------------------------------------------

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const qs = (params: Record<string, string>) => new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params }).toString();

// --- Wikipedia ----------------------------------------------------------------

interface Summary {
  title: string;
  extract?: string;
  description?: string;
  wikibase_item?: string;
  content_urls?: { desktop?: { page?: string } };
  type?: string;
}

async function wikipediaSummary(title: string) {
  return getJson<Summary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
}

/** Sections worth showing as "history & architecture". */
const WANTED = /histor|architect|design|construct|interior|exterior|origin|founding|background|significan|art|restoration|legend|tradition|religious|pilgrim/i;
const SKIP = /see also|references|notes|further reading|external links|gallery|bibliography|sources|citations/i;

/** Splits a plain-text Wikipedia extract into level-2 sections and keeps the useful ones. */
export function pickSections(extract: string, maxSections = 3, maxChars = 1400): HistorySection[] {
  const parts = extract.split(/\n==\s*([^=\n]+?)\s*==\n/); // [intro, heading1, body1, heading2, body2, …]
  const sections: HistorySection[] = [];
  for (let i = 1; i < parts.length && sections.length < maxSections; i += 2) {
    const heading = parts[i].trim();
    if (!WANTED.test(heading) || SKIP.test(heading)) continue;
    const body = parts[i + 1]
      .replace(/\n===+[^=\n]+===+\n/g, "\n") // drop sub-headings
      .replace(/\n{2,}/g, "\n\n")
      .trim();
    if (body.length < 80) continue;
    sections.push({ heading, text: trimToSentence(body, maxChars) });
  }
  return sections;
}

/** Cuts text at a sentence end near maxChars. */
export function trimToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (end > maxChars * 0.5 ? cut.slice(0, end + 1) : cut.trimEnd() + "…").trim();
}

async function wikipediaSections(title: string) {
  const data = await getJson<{ query?: { pages?: { extract?: string }[] } }>(
    `https://en.wikipedia.org/w/api.php?${qs({
      action: "query",
      prop: "extracts",
      explaintext: "1",
      exsectionformat: "wiki",
      redirects: "1",
      titles: title,
    })}`,
  );
  const extract = data?.query?.pages?.[0]?.extract;
  return extract ? pickSections(extract) : [];
}

// --- Wikidata -----------------------------------------------------------------

interface Snak {
  datavalue?: { value: unknown; type: string };
}
interface Claim {
  mainsnak: Snak;
  rank?: string;
}
type Claims = Record<string, Claim[]>;

const claimValues = (claims: Claims, prop: string) =>
  (claims[prop] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak.datavalue).map((c) => c.mainsnak.datavalue!.value);

const itemIds = (claims: Claims, prop: string) =>
  claimValues(claims, prop)
    .map((v) => (v as { id?: string }).id)
    .filter((id): id is string => Boolean(id));

/** Wikidata time → "1163", "12th century", "c. 1880s", "300 BCE". */
export function formatWikidataTime(value: { time: string; precision: number }): string | null {
  const m = /^([+-])(\d+)-/.exec(value.time);
  if (!m) return null;
  const bce = m[1] === "-";
  const year = parseInt(m[2], 10);
  const era = bce ? " BCE" : "";
  if (value.precision >= 9) return `${year}${era}`;
  if (value.precision === 8) return `${Math.floor(year / 10) * 10}s${era}`;
  if (value.precision === 7) {
    const century = Math.ceil(year / 100);
    return `${ordinal(century)} century${era}`;
  }
  if (value.precision === 6) return `${ordinal(Math.ceil(year / 1000))} millennium${era}`;
  return null;
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

async function wikidataLabels(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (!unique.length) return new Map();
  const data = await getJson<{ entities?: Record<string, { labels?: { en?: { value: string } } }> }>(
    `https://www.wikidata.org/w/api.php?${qs({ action: "wbgetentities", ids: unique.join("|"), props: "labels", languages: "en" })}`,
  );
  const map = new Map<string, string>();
  for (const [id, e] of Object.entries(data?.entities ?? {})) if (e.labels?.en) map.set(id, e.labels.en.value);
  return map;
}

interface WikidataFacts {
  facts: { label: string; value: string }[];
  website: string | null;
  address: string | null;
  commonsCategory: string | null;
  mainImage: string | null;
}

async function wikidataFacts(qid: string): Promise<WikidataFacts | null> {
  const data = await getJson<{ entities?: Record<string, { claims?: Claims }> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
  );
  const claims = data?.entities?.[qid]?.claims;
  if (!claims) return null;

  // Properties: P571 inception, P149 style, P84 architect, P1435 heritage status,
  // P140 religion, P1083 capacity, P856 website, P6375 address, P373 Commons category, P18 image.
  const styleIds = itemIds(claims, "P149");
  const architectIds = itemIds(claims, "P84");
  const heritageIds = itemIds(claims, "P1435");
  const religionIds = itemIds(claims, "P140");
  const labels = await wikidataLabels([...styleIds, ...architectIds, ...heritageIds, ...religionIds]);
  const names = (ids: string[], max = 3) =>
    ids
      .map((id) => labels.get(id))
      .filter(Boolean)
      .slice(0, max)
      .join(", ");

  const facts: { label: string; value: string }[] = [];
  const inception = claimValues(claims, "P571")[0] as { time: string; precision: number } | undefined;
  const founded = inception && formatWikidataTime(inception);
  if (founded) facts.push({ label: "Founded", value: founded });
  if (names(religionIds)) facts.push({ label: "Tradition", value: names(religionIds) });
  if (names(styleIds)) facts.push({ label: "Architectural style", value: names(styleIds) });
  if (names(architectIds)) facts.push({ label: "Architect", value: names(architectIds) });
  if (names(heritageIds, 2)) facts.push({ label: "Heritage status", value: names(heritageIds, 2) });
  const capacity = claimValues(claims, "P1083")[0] as { amount?: string } | undefined;
  if (capacity?.amount) facts.push({ label: "Capacity", value: `${Number(capacity.amount).toLocaleString("en-US")} people` });

  const address = claimValues(claims, "P6375")[0] as { text?: string } | undefined;
  return {
    facts,
    website: (claimValues(claims, "P856")[0] as string) ?? null,
    address: address?.text ?? null,
    commonsCategory: (claimValues(claims, "P373")[0] as string) ?? null,
    mainImage: (claimValues(claims, "P18")[0] as string) ?? null,
  };
}

// --- Commons photos -----------------------------------------------------------

interface ImageInfo {
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  descriptionurl: string;
  mime: string;
  width: number;
  height: number;
  extmetadata?: Record<string, { value: string }>;
}
interface CommonsPage {
  title: string;
  imageinfo?: ImageInfo[];
}

/** Commons metadata fields are small HTML snippets; we want plain text. */
export const stripHtml = (html: string | undefined) =>
  html
    ? html
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim() || null
    : null;

export function toPhoto(page: CommonsPage): Photo | null {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime)) return null;
  if (info.width < 500) return null; // skip tiny images and icons
  const meta = info.extmetadata ?? {};
  const restricted = stripHtml(meta.Restrictions?.value);
  if (restricted && /personality|trademark/i.test(restricted)) return null;
  return {
    url: info.thumburl,
    thumbUrl: info.thumburl.replace(/\/(\d+)px-/, "/400px-"),
    width: info.thumbwidth ?? info.width,
    height: info.thumbheight ?? info.height,
    title: page.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
    description: stripHtml(meta.ImageDescription?.value)?.slice(0, 300) ?? null,
    author: stripHtml(meta.Artist?.value)?.slice(0, 120) ?? null,
    license: stripHtml(meta.LicenseShortName?.value),
    licenseUrl: meta.LicenseUrl?.value ?? null,
    sourceUrl: info.descriptionurl,
  };
}

const IMAGE_PROPS = { prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: "1024" };

async function commonsPhotos(mainImage: string | null, category: string | null, limit = 12): Promise<Photo[]> {
  const pages: CommonsPage[] = [];

  if (mainImage) {
    const data = await getJson<{ query?: { pages?: CommonsPage[] } }>(
      `https://commons.wikimedia.org/w/api.php?${qs({ action: "query", titles: `File:${mainImage}`, ...IMAGE_PROPS })}`,
    );
    pages.push(...(data?.query?.pages ?? []));
  }
  if (category) {
    const data = await getJson<{ query?: { pages?: CommonsPage[] } }>(
      `https://commons.wikimedia.org/w/api.php?${qs({
        action: "query",
        generator: "categorymembers",
        gcmtitle: `Category:${category}`,
        gcmtype: "file",
        gcmlimit: "40",
        ...IMAGE_PROPS,
      })}`,
    );
    pages.push(...(data?.query?.pages ?? []));
  }

  const seen = new Set<string>();
  const photos: Photo[] = [];
  for (const page of pages) {
    if (seen.has(page.title)) continue;
    seen.add(page.title);
    const photo = toPhoto(page);
    if (photo) photos.push(photo);
    if (photos.length >= limit) break;
  }
  return photos;
}

// --- Putting it together ------------------------------------------------------

const cache = new Map<string, { info: PlaceInfo; expires: number }>();
const DAY = 24 * 60 * 60 * 1000;

export async function getPlaceInfo(place: Place): Promise<PlaceInfo> {
  const hit = cache.get(place.id);
  if (hit && hit.expires > Date.now()) return hit.info;

  const summary = place.wikipedia ? await wikipediaSummary(place.wikipedia) : null;
  const usableSummary = summary && summary.type !== "disambiguation" ? summary : null;
  const qid = place.wikidata ?? usableSummary?.wikibase_item ?? null;
  const title = usableSummary?.title ?? null;

  const [sections, wd] = await Promise.all([title ? wikipediaSections(title) : [], qid ? wikidataFacts(qid) : null]);
  const photos = wd ? await commonsPhotos(wd.mainImage, wd.commonsCategory) : [];

  const info: PlaceInfo = {
    ...EMPTY,
    available: Boolean(usableSummary || wd),
    summary: usableSummary?.extract ?? null,
    description: usableSummary?.description ?? null,
    sections,
    facts: wd?.facts ?? [],
    website: place.website ?? wd?.website ?? null,
    address: wd?.address ?? null,
    photos,
    wikipediaUrl: usableSummary?.content_urls?.desktop?.page ?? null,
    wikipediaTitle: title,
    wikidataId: qid,
  };

  // Cache failures briefly so a Wikimedia hiccup doesn't stick for a day.
  cache.set(place.id, { info, expires: Date.now() + (info.available ? DAY : 5 * 60 * 1000) });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return info;
}
