/**
 * Server-side place lookup.
 *
 * - Curated landmarks (public/data/places.geojson) have readable ids and are
 *   pre-rendered.
 * - Every other place (1.5M+) is found in the street-level vector tile its
 *   id points to, so place pages work without a database.
 */
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countryName } from "./cities";
import type { FaithKey } from "./faiths";
import { featureToPlace, type Place, type PlaceCollection } from "./types";
import { findPlaceInTiles, PLACE_TILE_ZOOM, type TilePlace } from "@/server/tiles";

let curated: Map<string, Place> | null = null;

function load(): Map<string, Place> {
  if (!curated) {
    const file = join(/* turbopackIgnore: true */ process.cwd(), "public/data/places.geojson");
    const data = JSON.parse(readFileSync(file, "utf8")) as PlaceCollection;
    curated = new Map(data.features.map((f) => [f.properties.id, { ...featureToPlace(f), landmark: true }]));
  }
  return curated;
}

export const getCuratedPlace = (id: string) => load().get(id) ?? null;
export const getCuratedPlaceIds = () => [...load().keys()];

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function fromTile(t: TilePlace, base?: Place): Place {
  const p = t.props;
  const cc = str(p.cc);
  return {
    id: t.id,
    name: str(p.name) ?? base?.name ?? "Place of worship",
    faith: (str(p.faith) ?? base?.faith ?? "other") as FaithKey,
    tradition: str(p.tradition) ?? base?.tradition ?? null,
    city: str(p.city) ?? base?.city ?? null,
    country: str(p.country) ?? base?.country ?? (cc ? countryName(cc) : null),
    heritage: Boolean(p.heritage) || Boolean(base?.heritage),
    website: str(p.website) ?? base?.website ?? null,
    wikipedia: str(p.wikipedia) ?? base?.wikipedia ?? null,
    wikidata: str(p.wikidata) ?? base?.wikidata ?? null,
    address: str(p.address),
    cc,
    landmark: Boolean(p.landmark) || Boolean(base?.landmark),
    lat: t.lat,
    lon: t.lon,
    footprint: t.footprint,
  };
}

const tileXY = (lon: number, lat: number) => {
  const n = 2 ** PLACE_TILE_ZOOM;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n),
  };
};

const cache = new Map<string, Place | null>();

/** Any place by id: curated first, then the tiles. Cached in memory. */
export async function findPlace(id: string): Promise<Place | null> {
  if (cache.has(id)) return cache.get(id)!;
  const base = getCuratedPlace(id);
  let place: Place | null = base;
  try {
    if (base) {
      // Landmarks: the tile adds the building outline and the exact pin.
      const t = await findPlaceInTiles(id, tileXY(base.lon, base.lat));
      if (t) place = fromTile(t, base);
    } else {
      const t = await findPlaceInTiles(id);
      if (t) place = fromTile(t);
    }
  } catch (err) {
    console.warn("Place tiles unavailable", err);
  }
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  cache.set(id, place);
  return place;
}

/** Names for a list of place ids (for lists of prayers, favourites, moderation). */
export async function placeNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const found = await Promise.all(unique.map((id) => findPlace(id)));
  return new Map(unique.map((id, i) => [id, found[i]?.name ?? "A place of worship"]));
}
