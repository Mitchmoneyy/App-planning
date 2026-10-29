/** Small client for the website's API (places, search, place info). */
import { SITE_URL } from "./config";

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SITE_URL}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export interface PlaceDetails {
  id: string;
  name: string;
  faith: string;
  tradition: string | null;
  city: string | null;
  country: string | null;
  address?: string | null;
  website?: string | null;
  heritage?: boolean;
  lat: number;
  lon: number;
  footprint?: GeoJSON.Geometry | null;
}

export interface PlaceInfo {
  description: string | null;
  summary: string | null;
  website: string | null;
  photos: { thumbUrl: string; title: string; author: string | null; license: string | null }[];
}

export type SearchHit =
  | { kind: "place"; id: string; name: string; faith: string; lat: number; lon: number; detail: string; landmark?: boolean }
  | { kind: "city" | "country"; name: string; detail: string; lat: number; lon: number; cc: string };
