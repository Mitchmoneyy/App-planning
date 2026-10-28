/**
 * The globe's map style, shared by both engines:
 *
 *   mapbox    Mapbox GL JS + Mapbox Satellite (to ~10 cm in cities), Streets
 *             vector tiles, 3D buildings and terrain. Needs NEXT_PUBLIC_MAPBOX_TOKEN.
 *   maptiler  MapLibre + MapTiler Satellite and OpenMapTiles vectors.
 *             Needs NEXT_PUBLIC_MAPTILER_KEY. Cheaper flat-rate plans.
 *   free      MapLibre + Sentinel-2 cloudless (EOX, 10 m) and OpenFreeMap
 *             vectors. No key; not street-level sharp, but costs nothing.
 *
 * Under every provider sit the bundled NASA Blue Marble / Black Marble tiles
 * (zoom 0-4), so the globe never shows a blank planet, even offline. At
 * night (dark mode) NASA's Black Marble city lights fade in from space and
 * hand over to darkened satellite imagery and glowing buildings near the ground.
 *
 * Tokens are public, URL-restricted browser keys (Mapbox and MapTiler require
 * the key in tile URLs); restrict them to your domain in each dashboard.
 */
import { FAITHS } from "../faiths";

export type Provider = "mapbox" | "maptiler" | "free";
export type Theme = "light" | "dark";
export type EngineKind = "mapbox" | "maplibre";

/* eslint-disable @typescript-eslint/no-explicit-any -- style JSON is shared by two libraries with different TS types */
type Layer = Record<string, any>;
type Style = Record<string, any>;

export function mapProvider(): Provider {
  const forced = process.env.NEXT_PUBLIC_MAP_PROVIDER;
  if (forced === "free" || forced === "maptiler" || forced === "mapbox") return forced;
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return "mapbox";
  if (process.env.NEXT_PUBLIC_MAPTILER_KEY) return "maptiler";
  return "free";
}

export const engineFor = (p: Provider): EngineKind => (p === "mapbox" ? "mapbox" : "maplibre");

const MAPTILER_KEY = () => process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

/* ---------- colours ---------- */
const GOLD = "#ffcf6b";
const faithColorExpr = (fallback = "#c9a45c") => ["match", ["get", "faith"], ...FAITHS.flatMap((f) => [f.key, f.color]), fallback];

/** Fonts per provider (Mapbox serves its own; others use our bundled Noto Sans). */
function fonts(p: Provider) {
  if (p === "mapbox") return { regular: ["DIN Pro Medium", "Arial Unicode MS Regular"], bold: ["DIN Pro Bold", "Arial Unicode MS Bold"] };
  return { regular: ["Noto Sans Regular"], bold: ["Noto Sans Bold"] };
}

/** Prefer an English / Latin name, then the local name. */
const labelName = (p: Provider) =>
  p === "mapbox" ? ["coalesce", ["get", "name_en"], ["get", "name"]] : ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];

/* ---------- sources ---------- */
function sources(p: Provider, origin: string): Style {
  const s: Style = {
    "nasa-day": { type: "raster", tiles: [`${origin}/tiles/day/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: 4, attribution: "NASA Blue Marble" },
    "nasa-night": { type: "raster", tiles: [`${origin}/tiles/night/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: 4, attribution: "NASA Black Marble" },
    "black-marble": {
      type: "raster",
      tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"],
      tileSize: 256,
      maxzoom: 8,
      attribution: "NASA Black Marble (GIBS)",
    },
    places: {
      type: "vector",
      tiles: [`${origin}/api/tiles/places/{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom: 12,
      promoteId: { places: "id", landmarks: "id", footprints: "id" },
      attribution: "Places: © OpenStreetMap contributors, Overture Maps Foundation, Wikidata",
    },
  };
  if (p === "mapbox") {
    s.satellite = { type: "raster", url: "mapbox://mapbox.satellite", tileSize: 256 };
    s.basemap = { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" };
    s.dem = { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 };
  } else if (p === "maptiler") {
    s.satellite = { type: "raster", tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY()}`], tileSize: 512, maxzoom: 20, attribution: "© MapTiler © OpenStreetMap contributors" };
    s.basemap = { type: "vector", url: `https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key=${MAPTILER_KEY()}` };
  } else {
    s.satellite = {
      type: "raster",
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"],
      tileSize: 256,
      maxzoom: 14,
      attribution: "Sentinel-2 cloudless 2016 by EOX (contains modified Copernicus Sentinel data)",
    };
    s.basemap = { type: "vector", url: "https://tiles.openfreemap.org/planet" };
  }
  return s;
}

/* ---------- theme-dependent paint ---------- */
export function themePaint(theme: Theme): Record<string, Record<string, unknown>> {
  const dark = theme === "dark";
  return {
    "nasa-day": { "raster-opacity": dark ? 0 : 1 },
    satellite: {
      "raster-opacity": dark ? ["interpolate", ["linear"], ["zoom"], 5, 0, 9, 1] : 1,
      "raster-brightness-max": dark ? 0.42 : 1,
      "raster-saturation": dark ? -0.35 : 0.05,
    },
    "nasa-night": { "raster-opacity": dark ? ["interpolate", ["linear"], ["zoom"], 4, 1, 6, 0] : 0 },
    "black-marble": { "raster-opacity": dark ? ["interpolate", ["linear"], ["zoom"], 2, 0, 3, 1, 8, 0.85, 10, 0] : 0 },
    boundaries: { "line-color": dark ? "rgba(170,190,255,0.35)" : "rgba(255,255,255,0.55)" },
    roads: { "line-color": dark ? "rgba(255,196,120,0.55)" : "rgba(255,255,255,0.6)" },
    "buildings-3d": { "fill-extrusion-color": dark ? "#2b3352" : "#e8e1d2", "fill-extrusion-opacity": dark ? 0.75 : 0.6 },
    "place-labels": { "text-color": dark ? "#e8ecff" : "#ffffff", "text-halo-color": dark ? "rgba(6,10,30,0.9)" : "rgba(20,30,50,0.75)" },
    "road-labels": { "text-color": dark ? "#ffe2b8" : "#ffffff", "text-halo-color": "rgba(10,15,30,0.8)" },
    "places-icon": { "text-color": dark ? "#fff4dc" : "#ffffff", "text-halo-color": dark ? "rgba(8,10,28,0.92)" : "rgba(15,22,40,0.85)" },
    "landmarks-icon": { "text-color": dark ? "#ffe9b8" : "#ffffff", "text-halo-color": dark ? "rgba(8,10,28,0.95)" : "rgba(15,22,40,0.9)" },
    "cluster-glow": { "circle-opacity": dark ? 0.5 : 0.18 },
    "fp-fill": { "fill-opacity": dark ? 0.3 : 0.22 },
    arcs: { "line-color": dark ? "#ffe7b3" : "#c46a12" },
    "arcs-glow": { "line-color": dark ? "rgba(255,206,120,0.45)" : "rgba(214,130,30,0.35)" },
  };
}

/** Atmosphere: MapLibre "sky", Mapbox "fog" (with stars at night). */
export function atmosphere(engine: EngineKind, theme: Theme) {
  const dark = theme === "dark";
  if (engine === "mapbox") {
    return dark
      ? { color: "rgb(28,36,70)", "high-color": "rgb(36,52,120)", "horizon-blend": 0.06, "space-color": "rgb(3,4,14)", "star-intensity": 0.75 }
      : { color: "rgb(200,220,245)", "high-color": "rgb(80,140,230)", "horizon-blend": 0.05, "space-color": "rgb(6,14,40)", "star-intensity": 0.25 };
  }
  return dark
    ? { "sky-color": "#050816", "horizon-color": "#22305e", "fog-color": "#0b1230", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.5, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 6, 0.5, 9, 0] }
    : { "sky-color": "#3f78d8", "horizon-color": "#bcd8ff", "fog-color": "#dbe9ff", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.6, 9, 0] };
}

/* ---------- layers ---------- */
function basemapLayers(p: Provider): Layer[] {
  const f = fonts(p);
  const mb = p === "mapbox";
  const str = (k: string) => ["to-string", ["get", k]];
  return [
    {
      id: "boundaries", type: "line", source: "basemap", "source-layer": mb ? "admin" : "boundary",
      filter: mb ? ["all", ["==", ["get", "admin_level"], 0], ["!=", str("maritime"), "true"]] : ["all", ["==", ["get", "admin_level"], 2], ["!=", str("maritime"), "1"]],
      paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 6, 1.2], "line-dasharray": [3, 2] },
    },
    {
      id: "roads", type: "line", source: "basemap", "source-layer": mb ? "road" : "transportation", minzoom: 11,
      filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "street", "minor", "primary_link", "secondary_link"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 11, 0.4, 16, 2.4, 19, 9], "line-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 12.5, 0.7] },
    },
    {
      id: "buildings-3d", type: "fill-extrusion", source: "basemap", "source-layer": "building", minzoom: 14.5,
      filter: mb ? ["==", str("extrude"), "true"] : ["all"],
      paint: {
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15.5, mb ? ["get", "height"] : ["coalesce", ["get", "render_height"], 8]],
        "fill-extrusion-base": mb ? ["get", "min_height"] : ["coalesce", ["get", "render_min_height"], 0],
      },
    },
    {
      id: "road-labels", type: "symbol", source: "basemap", "source-layer": mb ? "road" : "transportation_name", minzoom: 15,
      layout: { "symbol-placement": "line", "text-field": labelName(p), "text-font": f.regular, "text-size": 12, "text-max-angle": 30 },
      paint: { "text-halo-width": 1.2 },
    },
    {
      id: "place-labels", type: "symbol", source: "basemap", "source-layer": mb ? "place_label" : "place", minzoom: 2.5, maxzoom: 15,
      filter: mb ? ["match", ["get", "class"], ["settlement", "settlement_subdivision"], true, false] : ["match", ["get", "class"], ["city", "town", "village", "suburb", "quarter", "neighbourhood"], true, false],
      layout: {
        "text-field": labelName(p),
        "text-font": f.bold,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 10, 15],
        "text-letter-spacing": 0.04,
        "text-max-width": 8,
        "symbol-sort-key": mb ? ["get", "symbolrank"] : ["get", "rank"],
        "text-padding": 6,
      },
      paint: { "text-halo-width": 1.4, "text-halo-blur": 0.5 },
    },
  ];
}

function placeLayers(p: Provider): Layer[] {
  const f = fonts(p);
  return [
    // Building outlines of places of worship (street level).
    { id: "fp-fill", type: "fill", source: "places", "source-layer": "footprints", minzoom: 14, paint: { "fill-color": faithColorExpr(), "fill-opacity": 0.22 } },
    { id: "fp-line", type: "line", source: "places", "source-layer": "footprints", minzoom: 14, paint: { "line-color": faithColorExpr(), "line-width": 1.4, "line-opacity": 0.9 } },
    // Selected building: glow + gold 3D massing.
    { id: "sel-fp-glow", type: "line", source: "selected-fp", paint: { "line-color": GOLD, "line-width": 10, "line-blur": 7, "line-opacity": 0.85 } },
    { id: "sel-fp-line", type: "line", source: "selected-fp", paint: { "line-color": "#fff2c8", "line-width": 2.2 } },
    {
      id: "sel-fp-extrude", type: "fill-extrusion", source: "selected-fp", minzoom: 14.5,
      paint: { "fill-extrusion-color": GOLD, "fill-extrusion-opacity": 0.45, "fill-extrusion-height": ["max", ["coalesce", ["get", "height"], 0], 14] },
    },
    // Clusters.
    {
      id: "cluster-glow", type: "circle", source: "places", "source-layer": "places", filter: ["has", "point_count"],
      paint: { "circle-color": faithColorExpr(), "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 3, 18, 1000, 34, 100000, 52], "circle-blur": 1 },
    },
    {
      id: "clusters", type: "circle", source: "places", "source-layer": "places", filter: ["has", "point_count"],
      paint: {
        "circle-color": faithColorExpr(),
        "circle-opacity": 0.9,
        "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 3, 11, 100, 15, 5000, 21, 100000, 28],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(255,255,255,0.85)",
      },
    },
    {
      id: "cluster-count", type: "symbol", source: "places", "source-layer": "places", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": f.bold, "text-size": 11.5, "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" },
    },
    // Single places: faith icon, name when zoomed in.
    {
      id: "places-icon", type: "symbol", source: "places", "source-layer": "places", filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["concat", "faith-", ["get", "faith"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 12, 0.85, 17, 1.1],
        "icon-padding": 0,
        "text-field": ["step", ["zoom"], "", 13.5, ["get", "name"]],
        "text-font": f.regular,
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 1.05],
        "text-max-width": 9,
        "text-optional": true,
        "text-padding": 4,
      },
      paint: { "text-halo-width": 1.4 },
    },
    // Famous landmarks: always visible from space, labelled early.
    {
      id: "landmarks-icon", type: "symbol", source: "places", "source-layer": "landmarks",
      layout: {
        "icon-image": ["concat", "landmark-", ["get", "faith"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 0.85, 16, 1.05],
        "icon-allow-overlap": ["step", ["zoom"], false, 9, true],
        "symbol-sort-key": ["case", ["has", "heritage"], 0, 1],
        "text-field": ["step", ["zoom"], "", 3.5, ["get", "name"]],
        "text-font": f.bold,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 14, 13.5],
        "text-anchor": "top",
        "text-offset": [0, 1.25],
        "text-max-width": 10,
        "text-optional": true,
        "text-padding": 6,
      },
      paint: { "text-halo-width": 1.6 },
    },
  ];
}

function overlayLayers(p: Provider): Layer[] {
  const f = fonts(p);
  return [
    { id: "arrivals-heat", type: "heatmap", source: "arrivals", maxzoom: 9, paint: {
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 18, 6, 50],
      "heatmap-intensity": 0.8,
      "heatmap-opacity": 0.55,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,190,90,0)", 0.3, "rgba(255,190,90,0.35)", 1, "rgba(255,230,170,0.9)"],
    } },
    { id: "arcs-glow", type: "line", source: "arcs", layout: { "line-cap": "round" }, paint: { "line-width": 7, "line-blur": 5 } },
    { id: "arcs", type: "line", source: "arcs", layout: { "line-cap": "round" }, paint: { "line-width": 1.8, "line-opacity": 0.95 } },
    { id: "arrivals-ring", type: "circle", source: "arrivals", paint: { "circle-radius": 6, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": GOLD, "circle-stroke-width": 1.6, "circle-stroke-opacity": 0.8 } },
    { id: "requests-halo", type: "circle", source: "requests", paint: { "circle-radius": 16, "circle-color": "#ffd88a", "circle-opacity": 0.28, "circle-blur": 1 } },
    { id: "requests-dot", type: "circle", source: "requests", paint: { "circle-radius": 5, "circle-color": "#fff1cf", "circle-stroke-color": GOLD, "circle-stroke-width": 2 } },
    {
      id: "requests-label", type: "symbol", source: "requests", minzoom: 3,
      layout: { "text-field": ["concat", "Prayer request · ", ["get", "label"]], "text-font": f.regular, "text-size": 11.5, "text-anchor": "top", "text-offset": [0, 1], "text-optional": true },
      paint: { "text-color": "#fff4dc", "text-halo-color": "rgba(10,12,30,0.9)", "text-halo-width": 1.4 },
    },
    { id: "me-halo", type: "circle", source: "me", paint: { "circle-radius": 14, "circle-color": "#4da3ff", "circle-opacity": 0.25 } },
    { id: "me-dot", type: "circle", source: "me", paint: { "circle-radius": 6, "circle-color": "#2f8cff", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } },
    { id: "pick-halo", type: "circle", source: "pick", paint: { "circle-radius": 22, "circle-color": GOLD, "circle-opacity": 0.3, "circle-blur": 0.8 } },
    { id: "pick-dot", type: "circle", source: "pick", paint: { "circle-radius": 6, "circle-color": GOLD, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
    {
      id: "pick-label", type: "symbol", source: "pick",
      layout: { "text-field": ["get", "label"], "text-font": f.bold, "text-size": 13, "text-anchor": "top", "text-offset": [0, 1.2], "text-allow-overlap": true },
      paint: { "text-color": "#fff", "text-halo-color": "rgba(10,12,30,0.9)", "text-halo-width": 1.6 },
    },
    // Pulsing beacon on the place you're flying to.
    { id: "sel-pulse", type: "circle", source: "selected-pt", paint: { "circle-radius": 10, "circle-color": GOLD, "circle-opacity": 0.4, "circle-blur": 0.6, "circle-pitch-alignment": "map" } },
    { id: "sel-dot", type: "circle", source: "selected-pt", paint: { "circle-radius": 5, "circle-color": "#fff6dc", "circle-stroke-color": GOLD, "circle-stroke-width": 2.5 } },
  ];
}

const EMPTY = { type: "FeatureCollection", features: [] };

/** The full style for an engine/provider/theme. */
export function buildStyle({ provider, theme, origin }: { provider: Provider; theme: Theme; origin: string }): Style {
  const engine = engineFor(provider);
  const src = sources(provider, origin);
  for (const id of ["arcs", "arrivals", "requests", "me", "pick", "selected-fp", "selected-pt"]) src[id] = { type: "geojson", data: EMPTY };

  const layers: Layer[] = [
    { id: "ground", type: "background", paint: { "background-color": theme === "dark" ? "#040a1c" : "#0f2a4a" } },
    { id: "nasa-day", type: "raster", source: "nasa-day", paint: { "raster-fade-duration": 0 } },
    { id: "satellite", type: "raster", source: "satellite", paint: { "raster-fade-duration": 150 } },
    { id: "nasa-night", type: "raster", source: "nasa-night", paint: { "raster-fade-duration": 0 } },
    { id: "black-marble", type: "raster", source: "black-marble", paint: {} },
    ...basemapLayers(provider),
    ...placeLayers(provider),
    ...overlayLayers(provider),
  ];

  // Theme colours, with smooth transitions when switching.
  const paint = themePaint(theme);
  for (const l of layers) {
    if (paint[l.id]) l.paint = { ...l.paint, ...paint[l.id] };
  }

  const style: Style = {
    version: 8,
    name: "Global Sanctuary",
    glyphs: provider === "mapbox" ? "mapbox://fonts/mapbox/{fontstack}/{range}.pbf" : `${origin}/fonts/{fontstack}/{range}.pbf`,
    sources: src,
    layers,
    transition: { duration: 1200, delay: 0 },
  };
  if (engine === "mapbox") style.fog = atmosphere("mapbox", theme);
  else {
    style.projection = { type: "globe" };
    style.sky = atmosphere("maplibre", theme);
  }
  if (provider === "mapbox") style.terrain = { source: "dem", exaggeration: ["interpolate", ["linear"], ["zoom"], 9, 0, 12, 1] };
  return style;
}
