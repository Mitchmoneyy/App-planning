"use client";

/**
 * The interactive 3D globe (MapLibre GL in globe projection).
 *
 * - Spin / pinch-zoom / tilt with momentum come built in.
 * - Places are clustered at low zoom and split apart as you zoom in.
 *   Clustering runs in a web worker, so the main thread stays smooth.
 * - Parent components control it through the `GlobeApi` passed to `onReady`.
 */
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { FAITHS } from "@/lib/faiths";
import { resolveMapStyle } from "@/lib/mapStyle";
import type { LngLat, PlaceCollection } from "@/lib/types";

export interface GlobeApi {
  flyTo(center: LngLat, zoom?: number): void;
  fitBounds(bounds: [[number, number], [number, number]]): void;
  /** True when the online base map failed and we're showing the offline one. */
  offline: boolean;
}

interface Props {
  places: PlaceCollection;
  selectedId: string | null;
  userLocation: LngLat | null;
  onSelect(id: string | null): void;
  onReady(api: GlobeApi): void;
  onLocateClick(): void;
}

/** Shown before (or without) the user's location. */
const DEFAULT_VIEW = { center: [10, 25] as [number, number], zoom: 1.4 };

const SOURCE = "places";
const FONT = ["Noto Sans Regular"];

// ["match", ["get", "faith"], "christianity", "#5b8def", ..., fallback]
const FAITH_COLOR_EXPR = ["match", ["get", "faith"], ...FAITHS.flatMap((f) => [f.key, f.color]), "#8f96a3"] as unknown as maplibregl.ExpressionSpecification;

export default function GlobeMap({ places, selectedId, userLocation, onSelect, onReady, onLocateClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Keep the latest props in refs so map event handlers (registered once) see them.
  const latest = useRef({ places, selectedId, onSelect, onReady, onLocateClick });
  useEffect(() => {
    latest.current = { places, selectedId, onSelect, onReady, onLocateClick };
  });

  // ---- Create the map once -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;

    resolveMapStyle().then(({ style, offline }) => {
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: DEFAULT_VIEW.center,
        zoom: DEFAULT_VIEW.zoom,
        maxPitch: 70,
        attributionControl: {
          compact: true,
          customAttribution: offline
            ? 'Map: <a href="https://www.naturalearthdata.com/">Natural Earth</a> · Places: <a href="https://www.wikidata.org/">Wikidata</a>'
            : 'Places: <a href="https://www.wikidata.org/">Wikidata</a>',
        },
      });
      mapRef.current = map;

      map.addControl(new LocateControl(() => latest.current.onLocateClick()), "bottom-right");
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

      map.on("load", () => {
        if (!map) return;
        addPlaceLayers(map, latest.current.places);
        map.setFilter("place-selected", ["==", ["get", "id"], latest.current.selectedId ?? ""]);
        wireInteractions(map, (id) => latest.current.onSelect(id));
        latest.current.onReady({
          offline,
          flyTo: (center, zoom = 5) =>
            map?.flyTo({ center: [center.lon, center.lat], zoom, speed: 1.2, curve: 1.6, essential: true }),
          fitBounds: (bounds) => map?.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 2200 }),
        });
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Update markers when filters change ---------------------------------
  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>(SOURCE);
    source?.setData(places as unknown as GeoJSON.FeatureCollection);
  }, [places]);

  // ---- Highlight the selected place ---------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("place-selected")) {
      map.setFilter("place-selected", ["==", ["get", "id"], selectedId ?? ""]);
    }
  }, [selectedId]);

  // ---- "You are here" dot -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "user-dot";
      el.setAttribute("aria-label", "Your location");
      userMarkerRef.current = new maplibregl.Marker({ element: el });
    }
    userMarkerRef.current.setLngLat([userLocation.lon, userLocation.lat]).addTo(map);
  });

  return <div ref={containerRef} className="globe" role="application" aria-label="Interactive globe of places of worship" />;
}

// ---------------------------------------------------------------------------

function addPlaceLayers(map: MlMap, places: PlaceCollection) {
  map.addSource(SOURCE, {
    type: "geojson",
    data: places as unknown as GeoJSON.FeatureCollection,
    cluster: true,
    clusterRadius: 48, // px: how close markers must be to merge
    clusterMaxZoom: 11, // above this zoom every place is shown individually
  });

  // Cluster bubbles: bigger and warmer as they hold more places.
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: SOURCE,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#e8c987", 10, "#d9a95b", 50, "#c2873a"],
      "circle-radius": ["step", ["get", "point_count"], 14, 10, 19, 50, 25],
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,250,235,0.85)",
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: SOURCE,
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 12 },
    paint: { "text-color": "#2b1d08" },
  });

  // Selected place: soft glow behind its marker.
  map.addLayer({
    id: "place-selected",
    type: "circle",
    source: SOURCE,
    filter: ["==", ["get", "id"], ""],
    paint: { "circle-radius": 16, "circle-color": "#fff3c4", "circle-opacity": 0.7, "circle-blur": 0.4 },
  });

  // Individual places, colored by faith.
  map.addLayer({
    id: "places",
    type: "circle",
    source: SOURCE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": FAITH_COLOR_EXPR,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 5, 12, 8],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  // Names appear once you're zoomed in enough to read them.
  map.addLayer({
    id: "place-labels",
    type: "symbol",
    source: SOURCE,
    filter: ["!", ["has", "point_count"]],
    minzoom: 6,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT,
      "text-size": 12,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-max-width": 10,
      "text-optional": true,
    },
    paint: { "text-color": "#2a2f3a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });
}

function wireInteractions(map: MlMap, onSelect: (id: string | null) => void) {
  map.on("click", (e) => {
    const [hit] = map.queryRenderedFeatures(e.point, { layers: ["clusters", "places"] });

    if (!hit) {
      onSelect(null); // tapped empty globe: close the place card
      return;
    }

    const coords = (hit.geometry as GeoJSON.Point).coordinates as [number, number];

    if (hit.layer.id === "clusters") {
      // Zoom in just far enough for this cluster to split apart.
      const source = map.getSource<GeoJSONSource>(SOURCE);
      source?.getClusterExpansionZoom(hit.properties.cluster_id as number).then((zoom) => {
        map.easeTo({ center: coords, zoom: zoom + 0.3, duration: 900 });
      });
      return;
    }

    onSelect(hit.properties.id as string);
    map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 6), duration: 900 });
  });

  for (const layer of ["clusters", "places"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }
}

/** "Return to my location" button, styled like the built-in map controls. */
class LocateControl implements maplibregl.IControl {
  private container?: HTMLDivElement;
  constructor(private onClick: () => void) {}

  onAdd() {
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "locate-button";
    button.title = "Return to my location";
    button.setAttribute("aria-label", "Return to my location");
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    button.addEventListener("click", this.onClick);
    this.container.appendChild(button);
    return this.container;
  }

  onRemove() {
    this.container?.remove();
  }
}
