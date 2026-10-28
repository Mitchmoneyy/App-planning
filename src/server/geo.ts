/** Server-side access to the city dataset (rounding and validating areas). */
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CityIndex, type CityData } from "@/lib/cities";
import type { AreaRef } from "./db";
import { HttpError } from "./http";

let index: CityIndex | null = null;

export function cityIndex(): CityIndex {
  index ??= new CityIndex(JSON.parse(readFileSync(join(process.cwd(), "public/data/cities.json"), "utf8")) as CityData);
  return index;
}

/**
 * Turns what the browser sent ({ cityId } or { cc }) into a trusted, rounded
 * AreaRef from our own dataset. Never accepts raw coordinates.
 */
export function resolveArea(input: unknown, { required = true } = {}): AreaRef | null {
  const v = (input ?? {}) as { cityId?: unknown; cc?: unknown };
  const idx = cityIndex();
  if (typeof v.cityId === "number") {
    const city = idx.city(v.cityId);
    if (city) return { kind: "city", cityId: city.id, cc: city.cc, name: city.name, lat: city.lat, lon: city.lon };
  } else if (typeof v.cc === "string" && /^[A-Za-z]{2}$/.test(v.cc)) {
    const c = idx.countryArea(v.cc);
    if (c) return { kind: "country", cityId: null, cc: c.cc, name: c.name, lat: c.lat, lon: c.lon };
  }
  if (required) throw new HttpError(400, "Please choose a city or country.");
  return null;
}

/** "Manila, Philippines" / "Kenya" */
export const areaName = (a: AreaRef) => (a.kind === "city" ? `${a.name}, ${idxCountry(a.cc)}` : a.name);
const idxCountry = (cc: string) => cityIndex().countryArea(cc)?.name ?? cc;
