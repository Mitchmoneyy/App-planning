/**
 * Live "look around" views for the immersive experience, in order of preference:
 *
 * 1. Google Street View (when keys are set). We check the free Street View
 *    metadata endpoint on the server, then show the free Maps Embed API
 *    iframe, turned to face the building.
 * 2. Mapillary 360° street photos (free, CC BY-SA; needs a client token).
 * 3. Wikimedia Commons 360° panoramas (from wikimedia.ts).
 *
 * The browser falls back to a photo slideshow, then a 3D map, if none exist.
 */
import "server-only";
import type { Place } from "@/lib/types";
import type { Panorama } from "./wikimedia";

export interface StreetView {
  embedUrl: string;
  /** Who took it: Google, or a person who contributed a photo sphere. */
  outdoor: boolean;
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Compass bearing from a to b, so the view faces the building. */
export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

export async function getStreetView(place: Place): Promise<StreetView | null> {
  const serverKey = process.env.GOOGLE_MAPS_API_KEY;
  const embedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (!serverKey || !embedKey) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${place.lat},${place.lon}&radius=120&source=outdoor&key=${serverKey}`,
      { signal: AbortSignal.timeout(5000) },
    );
    const meta = (await res.json()) as { status: string; pano_id?: string; location?: { lat: number; lng: number } };
    if (meta.status !== "OK" || !meta.pano_id || !meta.location) return null;
    const heading = Math.round(bearing({ lat: meta.location.lat, lon: meta.location.lng }, place) % 360);
    return {
      embedUrl: `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(embedKey)}&pano=${meta.pano_id}&heading=${heading}&pitch=10&fov=80`,
      outdoor: true,
    };
  } catch {
    return null;
  }
}

export async function getMapillaryPanoramas(place: Place): Promise<Panorama[]> {
  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) return [];
  const d = 0.0015; // ~150 m box around the building
  const bbox = [place.lon - d, place.lat - d, place.lon + d, place.lat + d].join(",");
  try {
    const res = await fetch(
      `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,thumb_2048_url,creator,captured_at&is_pano=true&bbox=${bbox}&limit=5`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { id: string; thumb_2048_url?: string; creator?: { username?: string } }[] };
    return (json.data ?? [])
      .filter((i) => i.thumb_2048_url)
      .slice(0, 3)
      .map((i) => ({
        url: i.thumb_2048_url!,
        title: "Street-level 360° photo",
        author: i.creator?.username ?? null,
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        sourceUrl: `https://www.mapillary.com/app/?pKey=${i.id}`,
        source: "Mapillary" as const,
      }));
  } catch {
    return [];
  }
}
