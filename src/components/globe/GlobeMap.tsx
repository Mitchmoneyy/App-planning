"use client";

/**
 * The globe: one continuous map from space to street level.
 *
 * - Mapbox GL JS (with a token) or MapLibre GL (free), same style and layers.
 * - Satellite imagery streams in sharper as you zoom; vector labels and icons
 *   are signed-distance-field text with collision detection (no overlaps).
 * - Places of worship come from vector tiles (1.5M+ places): clustered when
 *   zoomed out, faith icons and names when zoomed in, building outlines at
 *   street level.
 * - Night mode: NASA Black Marble city lights, stars and glowing markers.
 * - Prayers travel as arcs of light and arrive as ripples.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { ActivityItem, AreaView } from "@/lib/apiTypes";
import { FAITHS } from "@/lib/faiths";
import { allFaithIcons } from "@/lib/map/icons";
import { atmosphere, buildStyle, engineFor, mapProvider, themePaint, type Theme } from "@/lib/map/style";
import type { LngLat } from "@/lib/types";

export interface PlaceSummary {
  id: string;
  name: string;
  faith: string;
  lat: number;
  lon: number;
  landmark?: boolean;
}

export interface FlyTarget {
  id: string;
  lat: number;
  lon: number;
  footprint?: GeoJSON.Geometry | null;
}

export interface GlobeApi {
  /** Smooth camera move to a zoom level (0 = whole Earth, 17 = street). Resolves on arrival. */
  flyTo(lat: number, lon: number, zoom?: number, ms?: number): Promise<void>;
  /** Cinematic arrival: rise, swing over, then dive to the building (tiles are preloaded first). */
  flyIn(target: FlyTarget): Promise<void>;
  /** Rise back up to space above the current point. */
  flyOut(): Promise<void>;
  /** Pause animations while the immersive view covers the globe. */
  setPaused(paused: boolean): void;
  pov(): { lat: number; lng: number; zoom: number };
  /** Places currently loaded around the view (for "nearby" search). */
  loadedPlaces(): PlaceSummary[];
}

export interface GlobeFilters {
  faiths: string[];
  landmarksOnly: boolean;
  near: { lat: number; lon: number; km: number } | null;
}

export interface GlobeProps {
  theme: Theme;
  userLocation: LngLat | null;
  selected: FlyTarget | null;
  activity: ActivityItem[];
  requests: { id: string; area: AreaView; prayedCount: number }[] | null;
  pick: { lat: number; lon: number; label: string } | null;
  filters: GlobeFilters;
  onPlaceClick(place: PlaceSummary): void;
  onRequestClick(id: string): void;
  onGlobeClick(lat: number, lon: number): void;
  onReady(api: GlobeApi): void;
  initialView?: { lat: number; lon: number; zoom: number };
}

type AnyMap = MapLibreMap;
type GeoJSONSourceLike = { setData(d: unknown): void };

const fc = (features: unknown[]) => ({ type: "FeatureCollection", features });
const point = (lon: number, lat: number, properties: Record<string, unknown> = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});

/** Points along the great circle from a to b, lifted into a gentle arc on the globe. */
function greatCircle(a: LngLat, b: LngLat, steps = 64): [number, number][] {
  const toRad = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a.lat * toRad, a.lon * toRad, b.lat * toRad, b.lon * toRad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d === 0) return [[a.lon, a.lat]];
  const out: [number, number][] = [];
  let prevLon = a.lon;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    let lon = Math.atan2(y, x) / toRad;
    // Keep longitudes continuous across the antimeridian.
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    prevLon = lon;
    out.push([lon, Math.atan2(z, Math.sqrt(x * x + y * y)) / toRad]);
  }
  return out;
}

/** A circle polygon (for the distance filter). */
function circlePolygon(c: LngLat, km: number, steps = 72) {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const dLat = (km / 110.574) * Math.sin(a);
    const dLon = (km / (111.32 * Math.cos((c.lat * Math.PI) / 180))) * Math.cos(a);
    ring.push([Math.max(-180, Math.min(180, c.lon + dLon)), Math.max(-85, Math.min(85, c.lat + dLat))]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

const PLACE_LAYERS = ["places-icon", "landmarks-icon", "clusters"];

export default function GlobeMap(props: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AnyMap | null>(null);
  const readyRef = useRef(false);
  const latest = useRef(props);
  const paused = useRef(false);

  useEffect(() => {
    latest.current = props;
  });

  /* ---------- create the map once ---------- */
  useEffect(() => {
    let cancelled = false;
    let map: AnyMap | null = null;
    let raf = 0;
    let poll = 0;
    const provider = mapProvider();
    const engine = engineFor(provider);

    (async () => {
      const lib =
        engine === "mapbox"
          ? ((await import("mapbox-gl")).default as unknown as typeof import("maplibre-gl"))
          : await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      if (engine === "mapbox") (lib as unknown as { accessToken: string }).accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

      const start = latest.current.initialView ?? { lat: 22, lon: 12, zoom: window.innerWidth > 1200 ? 2 : 1.6 };
      const style = buildStyle({ provider, theme: latest.current.theme, origin: window.location.origin });
      map = new lib.Map({
        container: containerRef.current,
        style: style as never,
        center: [start.lon, start.lat],
        zoom: start.zoom,
        minZoom: 0.6,
        maxZoom: 20.5,
        maxPitch: 75,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        attributionControl: false,
        fadeDuration: 180,
        ...(engine === "mapbox" ? { projection: "globe", antialias: true } : { canvasContextAttributes: { antialias: true } }),
      } as never) as AnyMap;
      mapRef.current = map;
      const m = map;
      if (process.env.NODE_ENV === "development") (window as unknown as { __gsMap?: AnyMap }).__gsMap = m;

      m.addControl(new lib.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");
      m.addControl(new lib.ScaleControl({ unit: navigator.language === "en-US" ? "imperial" : "metric", maxWidth: 110 }), "bottom-right");
      m.addControl(new lib.AttributionControl({ compact: true }), "bottom-right");
      // Start with the credits folded into the (i) button.
      const foldCredits = () => m.getContainer().querySelector(".maplibregl-compact-show, .mapboxgl-compact-show")?.classList.remove("maplibregl-compact-show", "mapboxgl-compact-show");
      m.once("style.load", () => window.setTimeout(foldCredits, 300));

      // Faith icons at the screen's pixel density.
      const ratio = Math.min(window.devicePixelRatio || 1, 2) >= 1.5 ? 2 : 1;
      const addIcons = () => {
        for (const { id, image } of allFaithIcons(ratio * 1.5)) {
          if (!m.hasImage(id)) m.addImage(id, image, { pixelRatio: ratio * 1.5 });
        }
      };
      // A tile server being unreachable isn't fatal (the NASA base layer stays): log once, quietly.
      let warned = false;
      m.on("error", (e: { error?: Error & { status?: number } }) => {
        const network = e.error?.status !== undefined || /fetch|network|load/i.test(e.error?.message ?? "");
        if (!network) console.error("Map error:", e.error);
        else if (!warned) console.warn("Some map tiles couldn't load:", e.error?.message);
        if (network) warned = true;
      });
      m.on("styleimagemissing", (e: { id: string }) => {
        if (e.id.startsWith("faith-") || e.id.startsWith("landmark-")) addIcons();
      });

      // Ready as soon as the style is in. ("load" waits for every source, and
      // never fires if one tile provider is down.)
      const ready = () => {
        if (cancelled || readyRef.current || !m.isStyleLoaded()) return;
        addIcons();
        readyRef.current = true;
        applyFilters(m, latest.current.filters);
        syncOverlays(m, latest.current);
        syncActivity(m, latest.current.activity, true);
        syncSelected(m, latest.current.selected);
        latest.current.onReady(api);
        animate();
      };
      m.on("style.load", ready);
      m.on("load", ready);
      poll = window.setInterval(() => (readyRef.current ? window.clearInterval(poll) : ready()), 400);

      // ----- clicks -----
      const placeFrom = (f: MapGeoJSONFeature): PlaceSummary => {
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
        const p = f.properties as Record<string, string>;
        return { id: p.id, name: p.name, faith: p.faith, lat, lon, landmark: f.layer.id === "landmarks-icon" };
      };
      m.on("click", (e) => {
        const box: [[number, number], [number, number]] = [
          [e.point.x - 6, e.point.y - 6],
          [e.point.x + 6, e.point.y + 6],
        ];
        const hits = m.queryRenderedFeatures(box, { layers: ["landmarks-icon", "places-icon", "clusters", "requests-dot", "requests-halo", "fp-fill"] });
        const hit = hits[0];
        if (!hit) return latest.current.onGlobeClick(e.lngLat.lat, e.lngLat.lng);
        if (hit.layer.id === "clusters") {
          const [lon, lat] = (hit.geometry as GeoJSON.Point).coordinates;
          m.easeTo({ center: [lon, lat], zoom: Math.min(m.getZoom() + 2.4, 16), duration: 900 });
        } else if (hit.layer.id.startsWith("requests")) {
          latest.current.onRequestClick(String(hit.properties.id));
        } else if (hit.layer.id === "fp-fill") {
          // A building outline: open its place (the pin is at its centre).
          const id = String(hit.properties.id);
          const near = m.querySourceFeatures("places", { sourceLayer: "places", filter: ["==", ["get", "id"], id] })[0]
            ?? m.querySourceFeatures("places", { sourceLayer: "landmarks", filter: ["==", ["get", "id"], id] })[0];
          if (near) latest.current.onPlaceClick(placeFrom(near as MapGeoJSONFeature));
        } else {
          latest.current.onPlaceClick(placeFrom(hit));
        }
      });
      for (const layer of [...PLACE_LAYERS, "requests-dot", "fp-fill"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }

      // ----- animation: pulse + arrival ripples (only while visible) -----
      const animate = () => {
        raf = requestAnimationFrame(animate);
        if (paused.current || !readyRef.current) return;
        // Only touch the map while something is moving, so it can go idle (battery, 60 fps elsewhere).
        const t = performance.now() / 1000;
        const mo = motion(m);
        if (t < mo.pulseUntil) {
          const k = (t % 1.6) / 1.6;
          m.setPaintProperty("sel-pulse", "circle-radius", 10 + 34 * k);
          m.setPaintProperty("sel-pulse", "circle-opacity", 0.55 * (1 - k));
          mo.pulseSettled = false;
        } else if (!mo.pulseSettled) {
          m.setPaintProperty("sel-pulse", "circle-radius", 18);
          m.setPaintProperty("sel-pulse", "circle-opacity", 0.3);
          mo.pulseSettled = true;
        }
        if (t < mo.rippleUntil) {
          const r = (t % 2.2) / 2.2;
          m.setPaintProperty("arrivals-ring", "circle-radius", 4 + 26 * r);
          m.setPaintProperty("arrivals-ring", "circle-stroke-opacity", 0.85 * (1 - r));
          mo.rippleSettled = false;
        } else if (!mo.rippleSettled) {
          m.setPaintProperty("arrivals-ring", "circle-stroke-opacity", 0);
          mo.rippleSettled = true;
        }
        drawArcs(m, t);
      };
    })();

    /* ---------- camera API ---------- */
    const wait = (m: AnyMap, ms: number) =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        m.once("moveend", finish);
        window.setTimeout(finish, ms + 400);
      });

    const api: GlobeApi = {
      flyTo: async (lat, lon, zoom = 3, ms = 1800) => {
        const m = mapRef.current;
        if (!m) return;
        m.flyTo({ center: [lon, lat], zoom, pitch: zoom > 13 ? 45 : 0, bearing: 0, duration: ms, essential: true, curve: 1.5 });
        await wait(m, ms);
      },
      flyIn: async (target) => {
        const m = mapRef.current;
        if (!m) return;
        syncSelected(m, target);
        const final = { center: [target.lon, target.lat] as [number, number], zoom: 17.2, pitch: 58, bearing: -18 };
        // Mapbox can fetch the destination's tiles before the camera moves, so nothing pops in.
        if (engine === "mapbox") (m as unknown as { flyTo(o: object): void }).flyTo({ ...final, preloadOnly: true });
        const c = m.getCenter();
        const far = Math.abs(c.lat - target.lat) + Math.abs(c.lng - target.lon) > 25;
        if (far) {
          m.flyTo({ center: final.center, zoom: 2.2, pitch: 0, bearing: 0, duration: 1800, curve: 1.2, essential: true });
          await wait(m, 1800);
        }
        const ms = far ? 4200 : 3600;
        m.flyTo({ ...final, duration: ms, curve: 1.6, essential: true });
        await wait(m, ms);
      },
      flyOut: async () => {
        const m = mapRef.current;
        if (!m) return;
        const c = m.getCenter();
        syncSelected(m, null);
        m.flyTo({ center: c, zoom: 2.4, pitch: 0, bearing: 0, duration: 2400, curve: 1.4, essential: true });
        await wait(m, 2400);
      },
      setPaused: (p) => {
        paused.current = p;
      },
      pov: () => {
        const m = mapRef.current;
        const c = m?.getCenter();
        return { lat: c?.lat ?? 0, lng: c?.lng ?? 0, zoom: m?.getZoom() ?? 1 };
      },
      loadedPlaces: () => {
        const m = mapRef.current;
        if (!m || !readyRef.current) return [];
        const seen = new Map<string, PlaceSummary>();
        for (const sourceLayer of ["landmarks", "places"]) {
          for (const f of m.querySourceFeatures("places", { sourceLayer })) {
            const p = f.properties as Record<string, string>;
            if (!p.id || p.point_count || seen.has(p.id)) continue;
            const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
            seen.set(p.id, { id: p.id, name: p.name, faith: p.faith, lat, lon, landmark: sourceLayer === "landmarks" });
          }
        }
        return [...seen.values()];
      },
    };

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      ro.disconnect();
      readyRef.current = false;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  /* ---------- theme ---------- */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    const provider = mapProvider();
    const engine = engineFor(provider);
    for (const [layer, paint] of Object.entries(themePaint(props.theme))) {
      if (!m.getLayer(layer)) continue;
      for (const [prop, value] of Object.entries(paint)) m.setPaintProperty(layer, prop, value as never);
    }
    m.setPaintProperty("ground", "background-color", props.theme === "dark" ? "#040a1c" : "#0f2a4a");
    const atmos = atmosphere(engine, props.theme);
    if (engine === "mapbox") (m as unknown as { setFog(f: object): void }).setFog(atmos);
    else m.setSky(atmos as never);
  }, [props.theme]);

  /* ---------- filters ---------- */
  useEffect(() => {
    const m = mapRef.current;
    if (m && readyRef.current) applyFilters(m, props.filters);
  }, [props.filters]);

  /* ---------- overlays ---------- */
  useEffect(() => {
    const m = mapRef.current;
    if (m && readyRef.current) syncOverlays(m, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these props matter
  }, [props.userLocation, props.requests, props.pick]);

  useEffect(() => {
    const m = mapRef.current;
    if (m && readyRef.current) syncActivity(m, props.activity, false);
  }, [props.activity]);

  useEffect(() => {
    const m = mapRef.current;
    if (m && readyRef.current) syncSelected(m, props.selected);
  }, [props.selected]);


  return <div ref={containerRef} className="globe-canvas" role="application" aria-label="Interactive globe. Drag to move, scroll or pinch to zoom, right-drag to tilt." />;
}

/* ================= module helpers ================= */

const src = (m: AnyMap, id: string) => m.getSource(id) as unknown as GeoJSONSourceLike | undefined;

function syncOverlays(m: AnyMap, { userLocation, requests, pick }: Pick<GlobeProps, "userLocation" | "requests" | "pick">) {
  src(m, "me")?.setData(fc(userLocation ? [point(userLocation.lon, userLocation.lat)] : []));
  src(m, "requests")?.setData(fc((requests ?? []).map((r) => point(r.area.lon, r.area.lat, { id: r.id, label: r.area.name, count: r.prayedCount }))));
  src(m, "pick")?.setData(fc(pick ? [point(pick.lon, pick.lat, { label: pick.label })] : []));
}

/* Short animations: pulse while arriving, ripples when prayers land. */
const motionState = new WeakMap<AnyMap, { pulseUntil: number; rippleUntil: number; pulseSettled: boolean; rippleSettled: boolean }>();
function motion(m: AnyMap) {
  let s = motionState.get(m);
  if (!s) motionState.set(m, (s = { pulseUntil: 0, rippleUntil: 0, pulseSettled: false, rippleSettled: false }));
  return s;
}

function syncSelected(m: AnyMap, target: FlyTarget | null) {
  motion(m).pulseUntil = target ? performance.now() / 1000 + 9 : 0;
  src(m, "selected-pt")?.setData(fc(target ? [point(target.lon, target.lat, { id: target.id })] : []));
  src(m, "selected-fp")?.setData(
    fc(target?.footprint ? [{ type: "Feature", geometry: target.footprint, properties: { id: target.id } }] : []),
  );
}

/** Faith, landmark and distance filters, applied to tiles on the GPU. */
function applyFilters(m: AnyMap, f: GlobeFilters) {
  const conds: unknown[] = [];
  if (f.faiths.length) conds.push(["in", ["get", "faith"], ["literal", f.faiths]]);
  if (f.near) conds.push(["within", circlePolygon(f.near, f.near.km)]);
  const single = ["all", ["!", ["has", "point_count"]], ...conds];
  m.setFilter("places-icon", (f.landmarksOnly ? ["==", ["get", "id"], "__none__"] : single) as never);
  m.setFilter("landmarks-icon", (conds.length ? ["all", ...conds] : null) as never);

  // Clusters: count only the selected faiths (tiles carry a count per faith).
  const count = f.faiths.length ? ["+", 0, ...f.faiths.map((k) => ["coalesce", ["get", `n_${k}`], 0])] : ["get", "point_count"];
  const clusterFilter = f.landmarksOnly
    ? ["==", ["get", "id"], "__none__"]
    : ["all", ["has", "point_count"], [">", count, 0], ...(f.near ? [["within", circlePolygon(f.near, f.near.km)]] : [])];
  for (const id of ["clusters", "cluster-glow", "cluster-count"]) m.setFilter(id, clusterFilter as never);
  const abbreviated = ["case", [">=", count, 1000], ["concat", ["to-string", ["round", ["/", count, 1000]]], "k"], ["to-string", count]];
  m.setLayoutProperty("cluster-count", "text-field", (f.faiths.length ? abbreviated : ["get", "point_count_abbreviated"]) as never);
  m.setPaintProperty("clusters", "circle-radius", ["interpolate", ["linear"], count, 1, 10, 100, 15, 5000, 21, 100000, 28] as never);
}

/* ----- prayer arcs: each new arc draws itself over ~2 s, then glows softly ----- */
const ARC_DRAW_S = 2.2;
const arcState = new WeakMap<AnyMap, { arcs: { coords: [number, number][]; born: number }[]; dirty: boolean }>();

function syncActivity(m: AnyMap, activity: ActivityItem[], initial: boolean) {
  const now = performance.now() / 1000;
  const prev = arcState.get(m)?.arcs ?? [];
  const known = new Map(prev.map((a) => [a.coords.map((c) => c.join()).join(";"), a]));
  const arcs = activity
    .filter((a) => a.from)
    .slice(0, 120)
    .map((a) => {
      const coords = greatCircle(a.from!, a.to);
      const key = coords.map((c) => c.join()).join(";");
      return known.get(key) ?? { coords, born: initial ? now - ARC_DRAW_S - Math.random() * 3 : now };
    });
  arcState.set(m, { arcs, dirty: true });
  if (activity.length && (!initial || arcs.length)) motion(m).rippleUntil = now + 14;
  src(m, "arrivals")?.setData(fc(activity.slice(0, 60).map((a) => point(a.to.lon, a.to.lat))));
}

function drawArcs(m: AnyMap, t: number) {
  const s = arcState.get(m);
  if (!s) return;
  const animating = s.arcs.some((a) => t - a.born < ARC_DRAW_S);
  if (!animating && !s.dirty) return;
  s.dirty = false;
  const features = s.arcs.map((a) => {
    const k = Math.min(1, (t - a.born) / ARC_DRAW_S);
    const eased = 1 - (1 - k) ** 3;
    const n = Math.max(2, Math.round(a.coords.length * eased));
    return { type: "Feature", geometry: { type: "LineString", coordinates: a.coords.slice(0, n) }, properties: {} };
  });
  src(m, "arcs")?.setData(fc(features));
}

export const FAITH_KEYS = FAITHS.map((f) => f.key);
