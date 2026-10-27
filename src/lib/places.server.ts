/**
 * Server-side access to the places dataset (used to pre-render detail pages).
 * Reads the same file the globe loads in the browser.
 */
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { featureToPlace, type Place, type PlaceCollection } from "./types";

let cache: Map<string, Place> | null = null;

function load(): Map<string, Place> {
  if (!cache) {
    const file = join(process.cwd(), "public/data/places.geojson");
    const data = JSON.parse(readFileSync(file, "utf8")) as PlaceCollection;
    cache = new Map(data.features.map((f) => [f.properties.id, featureToPlace(f)]));
  }
  return cache;
}

export const getPlace = (id: string) => load().get(id) ?? null;
export const getAllPlaceIds = () => [...load().keys()];
