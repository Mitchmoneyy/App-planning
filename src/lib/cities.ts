/**
 * World cities (GeoNames, 15,000+ people) for the "pray for people in places"
 * features. Used in the browser and on the server.
 *
 * Privacy rule: locations are always rounded to a city centre (or a whole
 * country). Exact coordinates are never stored or shown.
 */
import { distanceKm } from "./geo";

/** [geonameId, name, countryCode, lat, lon, population] */
export type CityRow = [number, string, string, number, number, number];

export interface CityData {
  cities: CityRow[];
  /** countryCode → [lat, lon] of the country's population centre */
  countries: Record<string, [number, number]>;
}

export interface City {
  id: number;
  name: string;
  cc: string;
  lat: number;
  lon: number;
  pop: number;
}

/** A place someone can pray for, or pray from: a city or a whole country. */
export type Area =
  | { kind: "city"; cityId: number; name: string; cc: string; country: string; lat: number; lon: number }
  | { kind: "country"; cc: string; name: string; country: string; lat: number; lon: number };

const displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

/** "PH" → "Philippines" */
export function countryName(cc: string): string {
  try {
    return displayNames?.of(cc.toUpperCase()) ?? cc;
  } catch {
    return cc;
  }
}

export const areaLabel = (a: Pick<Area, "kind" | "name" | "country">) => (a.kind === "city" ? `${a.name}, ${a.country}` : a.country);

const toCity = (r: CityRow): City => ({ id: r[0], name: r[1], cc: r[2], lat: r[3], lon: r[4], pop: r[5] });

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Fast nearest-city and search over the dataset (1° grid buckets). */
export class CityIndex {
  private grid = new Map<string, City[]>();
  private byId = new Map<number, City>();
  readonly all: City[];

  constructor(private data: CityData) {
    this.all = data.cities.map(toCity);
    for (const c of this.all) {
      this.byId.set(c.id, c);
      const key = `${Math.floor(c.lat)}:${Math.floor(c.lon)}`;
      (this.grid.get(key) ?? this.grid.set(key, []).get(key)!).push(c);
    }
  }

  city(id: number): City | null {
    return this.byId.get(id) ?? null;
  }

  hasCountry(cc: string) {
    return cc.toUpperCase() in this.data.countries;
  }

  cityArea(c: City): Area {
    return { kind: "city", cityId: c.id, name: c.name, cc: c.cc, country: countryName(c.cc), lat: c.lat, lon: c.lon };
  }

  countryArea(cc: string): Area | null {
    const code = cc.toUpperCase();
    const centre = this.data.countries[code];
    if (!centre) return null;
    const name = countryName(code);
    return { kind: "country", cc: code, name, country: name, lat: centre[0], lon: centre[1] };
  }

  /** Cities within `maxKm` of a point (searching the nearby grid cells). */
  within(lat: number, lon: number, maxKm: number): { city: City; km: number }[] {
    const out: { city: City; km: number }[] = [];
    const span = Math.ceil(maxKm / 80) + 1; // ~1° of latitude ≈ 111 km
    const la = Math.floor(lat);
    const lo = Math.floor(lon);
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span * 2; dx <= span * 2; dx++) {
        let x = lo + dx;
        if (x < -180) x += 360;
        if (x >= 180) x -= 360;
        for (const c of this.grid.get(`${la + dy}:${x}`) ?? []) {
          const km = distanceKm({ lat, lon }, c);
          if (km <= maxKm) out.push({ city: c, km });
        }
      }
    }
    return out;
  }

  /** Nearest city within `maxKm`. */
  nearest(lat: number, lon: number, maxKm = 80): City | null {
    let best: { city: City; km: number } | null = null;
    for (const hit of this.within(lat, lon, maxKm)) if (!best || hit.km < best.km) best = hit;
    return best?.city ?? null;
  }

  /**
   * Rounds a point to an Area: the largest city within 25 km, else the nearest within 60 km, otherwise the
   * country of the nearest city within a few hundred km, otherwise null (sea).
   */
  snap(lat: number, lon: number): Area | null {
    // Prefer the main city of a metro area (more meaningful, and less precise) …
    const close = this.within(lat, lon, 25);
    const major = close.reduce<City | null>((best, h) => (!best || h.city.pop > best.pop ? h.city : best), null);
    if (major) return this.cityArea(major);
    // … otherwise the nearest town.
    const city = this.nearest(lat, lon, 60);
    if (city) return this.cityArea(city);
    const farCity = this.nearest(lat, lon, 400);
    return farCity ? this.countryArea(farCity.cc) : null;
  }

  /** Cities and countries matching a name, biggest first. */
  search(query: string, limit = 8): Area[] {
    const q = fold(query);
    if (q.length < 2) return [];
    const out: Area[] = [];
    for (const cc of Object.keys(this.data.countries)) {
      if (fold(countryName(cc)).startsWith(q)) out.push(this.countryArea(cc)!);
    }
    for (const c of this.all) {
      if (out.length >= limit * 3) break;
      if (fold(c.name).startsWith(q)) out.push(this.cityArea(c));
    }
    return out.slice(0, limit);
  }
}
