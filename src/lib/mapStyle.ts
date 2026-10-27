/**
 * Picks the base map style for the globe.
 *
 * We use a free OpenStreetMap-based style (OpenFreeMap by default — no API key,
 * no per-view fees). If it can't be reached, we fall back to a minimal offline
 * style built from bundled country shapes so the globe still works.
 */
import type { StyleSpecification } from "maplibre-gl";

export const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Free font server (used for cluster counts in the fallback style).
const FALLBACK_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/** Sky / atmosphere glow around the globe, fading out as you zoom in. */
const SKY: StyleSpecification["sky"] = {
  "sky-color": "#0b1530",
  "horizon-color": "#31406b",
  "fog-color": "#a9b8d8",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.5,
  "fog-ground-blend": 0.3,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
};

export function offlineStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: FALLBACK_GLYPHS,
    sources: {
      countries: { type: "geojson", data: "/data/countries-110m.geojson" },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": "#1d3557" } },
      { id: "land", type: "fill", source: "countries", paint: { "fill-color": "#e9e2cf" } },
      { id: "borders", type: "line", source: "countries", paint: { "line-color": "#b9ad90", "line-width": 0.6 } },
    ],
  };
}

/**
 * Loads the style JSON (with a timeout). With `globe`, switches it to the 3D
 * globe projection with an atmosphere. Returns which style was used so the UI
 * can say so.
 */
export async function resolveMapStyle({ globe = true } = {}): Promise<{ style: StyleSpecification; offline: boolean }> {
  const url = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE_URL;
  let style: StyleSpecification;
  let offline = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Style request failed: ${res.status}`);
    style = (await res.json()) as StyleSpecification;
  } catch (err) {
    console.warn("Base map unavailable, using offline map.", err);
    style = offlineStyle();
    offline = true;
  }

  return { style: globe ? { ...style, projection: { type: "globe" }, sky: SKY } : style, offline };
}
