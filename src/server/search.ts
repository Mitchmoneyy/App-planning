/**
 * Search across places of worship, cities and countries.
 *
 * - "mosques in Istanbul", "gurdwara london", "temples": a faith word becomes a
 *   faith filter; the rest is the place or area to look in.
 * - Cities and countries: GeoNames (every city over 15,000 people).
 * - Places: famous landmarks always; all 1.5M+ places when the places table is
 *   loaded into Postgres (trigram name search, nearest first). The browser
 *   also adds matches from the map tiles already loaded around the view.
 */
import "server-only";
import postgres from "postgres";
import { cityIndex } from "./geo";
import { countryName } from "@/lib/cities";
import type { FaithKey } from "@/lib/faiths";
import { getCuratedPlace, getCuratedPlaceIds } from "@/lib/places.server";
import type { SearchHit } from "@/lib/apiTypes";

const FAITH_WORDS: [RegExp, FaithKey][] = [
  [/\b(church(es)?|cathedrals?|chapels?|basilicas?|parish(es)?|christian)\b/, "christianity"],
  [/\b(mosques?|masjids?|islamic|muslim)\b/, "islam"],
  [/\b(synagogues?|jewish|shuls?)\b/, "judaism"],
  [/\b(mandirs?|hindu)\b/, "hinduism"],
  [/\b(gurdwaras?|gurudwaras?|sikh)\b/, "sikhism"],
  [/\b(wats?|pagodas?|buddhist|monaster(y|ies)|viharas?)\b/, "buddhism"],
  [/\b(jinjas?|shinto|shrines?)\b/, "shinto"],
  [/\b(jain|derasars?)\b/, "jainism"],
  [/\b(bah[aá]['’]?[ií])\b/, "bahai"],
  [/\b(fire temples?|zoroastrian)\b/, "zoroastrianism"],
];

export function parseQuery(raw: string): { text: string; faith: FaithKey | null } {
  let text = raw.toLowerCase().trim();
  let faith: FaithKey | null = null;
  for (const [re, key] of FAITH_WORDS) {
    if (re.test(text)) {
      faith = key;
      text = text.replace(re, " ");
      break;
    }
  }
  text = text.replace(/\b(in|near|at|around|of|the)\b/g, " ").replace(/\s+/g, " ").trim();
  return { text, faith };
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let sql: postgres.Sql | null | undefined;
function db() {
  if (sql === undefined) sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20, onnotice: () => {} }) : null;
  return sql;
}

async function searchDb(text: string, faith: FaithKey | null, near: { lat: number; lon: number } | null, limit: number): Promise<SearchHit[]> {
  const s = db();
  if (!s || text.length < 2) return [];
  try {
    const point = near ? s`st_setsrid(st_makepoint(${near.lon}, ${near.lat}), 4326)::geography` : null;
    const rows = await s`
      select id, name, faith, city, country, cc, st_y(geom::geometry) as lat, st_x(geom::geometry) as lon
      from places
      where name % ${text} ${faith ? s`and faith = ${faith}` : s``}
      order by ${point ? s`(1 - similarity(name, ${text})) * 50 + least(st_distance(geom, ${point}) / 1000, 20000) / 400` : s`similarity(name, ${text}) desc`}
      limit ${limit}`;
    return rows.map((r) => ({
      kind: "place" as const,
      id: r.id as string,
      name: r.name as string,
      faith: r.faith as FaithKey,
      lat: Number(r.lat),
      lon: Number(r.lon),
      detail: [r.city, r.country ?? (r.cc ? countryName(r.cc as string) : null)].filter(Boolean).join(", "),
    }));
  } catch {
    return []; // places table not loaded yet
  }
}

function searchLandmarks(text: string, faith: FaithKey | null, limit: number): SearchHit[] {
  const q = fold(text);
  if (q.length < 2 && !faith) return [];
  const out: SearchHit[] = [];
  for (const id of getCuratedPlaceIds()) {
    const p = getCuratedPlace(id)!;
    if (faith && p.faith !== faith) continue;
    const hay = fold([p.name, p.city, p.country].filter(Boolean).join(" | "));
    if (q && !hay.includes(q)) continue;
    out.push({ kind: "place", id: p.id, name: p.name, faith: p.faith, lat: p.lat, lon: p.lon, detail: [p.city, p.country].filter(Boolean).join(", "), landmark: true });
    if (out.length >= limit) break;
  }
  return out;
}

export async function search(raw: string, near: { lat: number; lon: number } | null): Promise<{ faith: FaithKey | null; hits: SearchHit[] }> {
  const { text, faith } = parseQuery(raw);
  const areas: SearchHit[] = text.length >= 2
    ? cityIndex().search(text, 6).map((a) =>
        a.kind === "city"
          ? { kind: "city" as const, name: a.name, detail: a.country, lat: a.lat, lon: a.lon, cc: a.cc }
          : { kind: "country" as const, name: a.name, detail: "Country", lat: a.lat, lon: a.lon, cc: a.cc },
      )
    : [];
  const landmarks = searchLandmarks(text, faith, 6);
  const places = await searchDb(text, faith, near, 10);
  const seen = new Set<string>();
  const placeHits = [...landmarks, ...places].filter((h) => h.kind !== "place" || (!seen.has(h.id) && seen.add(h.id)));
  // An area first when the query names one exactly ("Istanbul"), else places first.
  const exactArea = areas.find((a) => fold(a.name) === fold(text));
  const hits = exactArea ? [exactArea, ...placeHits, ...areas.filter((a) => a !== exactArea)] : [...placeHits, ...areas];
  return { faith, hits: hits.slice(0, 12) };
}
