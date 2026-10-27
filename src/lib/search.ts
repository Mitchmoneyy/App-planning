/**
 * In-browser search over the loaded places: by place name, city or country.
 *
 * Fine for the sample dataset (hundreds of places). In Phase 5 this moves to a
 * server-side search index so it works across millions of places and any city.
 */
import { boundsOf } from "./geo";
import type { Place } from "./types";

export type SearchResult =
  | { kind: "place"; key: string; label: string; detail: string; place: Place }
  | { kind: "city" | "country"; key: string; label: string; detail: string; places: Place[] };

/** Lower-case and strip accents so "cordoba" finds "Córdoba". */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** 0 = no match; higher is better. Prefix matches beat matches mid-word. */
function score(text: string | null, query: string): number {
  if (!text) return 0;
  const t = normalize(text);
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  if (t.split(/[\s\-(),']+/).some((word) => word.startsWith(query))) return 60;
  if (t.includes(query)) return 30;
  return 0;
}

export function searchPlaces(places: Place[], rawQuery: string, limit = 8): SearchResult[] {
  const query = normalize(rawQuery);
  if (query.length < 2) return [];

  const results: Array<SearchResult & { score: number }> = [];

  // Countries and cities: group places so we can fly to the whole area.
  const countries = new Map<string, Place[]>();
  const cities = new Map<string, Place[]>();
  for (const p of places) {
    if (p.country) countries.set(p.country, [...(countries.get(p.country) ?? []), p]);
    if (p.city) {
      const key = `${p.city}|${p.country ?? ""}`;
      cities.set(key, [...(cities.get(key) ?? []), p]);
    }
  }

  for (const [country, list] of countries) {
    const s = score(country, query);
    if (s) results.push({ kind: "country", key: `country:${country}`, label: country, detail: countLabel(list.length), places: list, score: s + 5 });
  }
  for (const [key, list] of cities) {
    const [city, country] = key.split("|");
    const s = score(city, query);
    if (s) results.push({ kind: "city", key: `city:${key}`, label: city, detail: `${country} · ${countLabel(list.length)}`, places: list, score: s + 2 });
  }
  for (const p of places) {
    const s = score(p.name, query);
    if (s) results.push({ kind: "place", key: `place:${p.id}`, label: p.name, detail: [p.city, p.country].filter(Boolean).join(", "), place: p, score: s });
  }

  return results
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const countLabel = (n: number) => `${n} place${n === 1 ? "" : "s"} of worship`;

/** Where the globe should go for a search result. */
export function resultTarget(result: SearchResult) {
  if (result.kind === "place") return { center: result.place, zoom: 15 };
  if (result.places.length === 1) return { center: result.places[0], zoom: result.kind === "city" ? 12 : 6 };
  return { bounds: boundsOf(result.places) };
}
