import type { FaithKey } from "./faiths";

/** A single place of worship, as stored in public/data/places.geojson. */
export interface PlaceProperties {
  /** Stable, URL-safe id, e.g. "notre-dame-de-paris". */
  id: string;
  name: string;
  faith: FaithKey;
  /** Denomination / school / branch, e.g. "Catholic", "Sunni", "Theravada". */
  tradition: string | null;
  city: string | null;
  country: string | null;
  /** Part of a UNESCO World Heritage Site. */
  heritage: boolean;
  website: string | null;
  /** English Wikipedia article title. */
  wikipedia: string | null;
  /** Wikidata item id, e.g. "Q2981". */
  wikidata: string | null;
}

/** A place with its coordinates pulled out for convenience. */
export interface Place extends PlaceProperties {
  lat: number;
  lon: number;
  /** Street address, when a source has one. */
  address?: string | null;
  /** ISO country code. */
  cc?: string | null;
  /** A well-known landmark (shown from space). */
  landmark?: boolean;
  /** Building outline, for the highlight. */
  footprint?: GeoJSON.Geometry | null;
}

export interface PlaceFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PlaceProperties;
}

export interface PlaceCollection {
  type: "FeatureCollection";
  metadata?: { source: string; generatedAt: string; count: number };
  features: PlaceFeature[];
}

export interface LngLat {
  lon: number;
  lat: number;
}

export const featureToPlace = (f: PlaceFeature): Place => ({
  ...f.properties,
  lon: f.geometry.coordinates[0],
  lat: f.geometry.coordinates[1],
});
