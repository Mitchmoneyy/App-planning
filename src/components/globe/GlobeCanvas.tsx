"use client";

/**
 * The 3D globe (globe.gl / three.js).
 *
 * - Day Earth (NASA Blue Marble) and night Earth (NASA city lights) blended in
 *   a custom shader, so switching themes cross-fades smoothly.
 * - Starfield + atmosphere glow; markers glow like candles at night.
 * - Places are clustered (supercluster) for the current zoom and view, so only
 *   a few hundred HTML markers exist at once, however big the dataset.
 * - Prayers travel as animated arcs of light, arrive as ripples, and leave a
 *   soft glow where many are being sent.
 */
import Globe, { type GlobeInstance } from "globe.gl";
import Supercluster from "supercluster";
import * as THREE from "three";
import { useEffect, useRef } from "react";
import type { ActivityItem, AreaView } from "@/lib/apiTypes";
import { faithColor } from "@/lib/faiths";
import { distanceKm } from "@/lib/geo";
import type { LngLat, PlaceFeature } from "@/lib/types";

export interface GlobeApi {
  /** Smooth camera move. Resolves when it arrives. */
  flyTo(lat: number, lon: number, altitude?: number, ms?: number): Promise<void>;
  /** Cinematic arrival: swing over, then dive down to the place. */
  flyIn(lat: number, lon: number): Promise<void>;
  /** Rise back up to space above the current point. */
  flyOut(): Promise<void>;
  /** Stop/start rendering (saves battery while the immersive view covers the globe). */
  setPaused(paused: boolean): void;
  pov(): { lat: number; lng: number; altitude: number };
}

export interface GlobeProps {
  places: PlaceFeature[];
  theme: "light" | "dark";
  userLocation: LngLat | null;
  selectedId: string | null;
  activity: ActivityItem[];
  /** Open prayer requests to show as soft lights (null = hidden). */
  requests: { id: string; area: AreaView; prayedCount: number }[] | null;
  /** A spot the user picked to send a prayer to. */
  pick: { lat: number; lon: number; label: string } | null;
  onPlaceClick(id: string): void;
  onRequestClick(id: string): void;
  onGlobeClick(lat: number, lon: number): void;
  onReady(api: GlobeApi): void;
  initialView?: { lat: number; lon: number; altitude: number };
}

/* ---------- Zoom helpers: camera altitude (globe radii) ↔ map-style zoom ---------- */
const zoomForAltitude = (alt: number) => Math.max(0, Math.min(18, Math.log2(8 / Math.max(alt, 0.001))));
const altitudeForZoom = (z: number) => 8 / 2 ** z;

/* ---------- Day/night shader ---------- */
const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform float night;   // 0 = day, 1 = night
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec3 day = texture2D(dayTex, vUv).rgb;
    vec3 nite = texture2D(nightTex, vUv).rgb;
    // Soft daylight from the upper left of the screen.
    float light = clamp(dot(normalize(vNormal), normalize(vec3(-0.45, 0.55, 0.75))), 0.0, 1.0);
    vec3 dayLit = day * (0.62 + 0.55 * light);
    // City lights: lift the bright warm pixels so they glow.
    vec3 glow = nite * 1.15 + pow(max(nite - vec3(0.3), vec3(0.0)), vec3(1.4)) * 1.8;
    // Faint rim light keeps the night globe's edge readable against space.
    float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    glow += vec3(0.10, 0.16, 0.35) * rim;
    gl_FragColor = vec4(mix(dayLit, glow, night), 1.0);
  }`;

function makeStars(count = 2600) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Random direction, far away.
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const r = 1800 + Math.random() * 1200;
    const s = Math.sqrt(1 - u * u);
    positions.set([r * s * Math.cos(t), r * s * Math.sin(t), r * u], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  return new THREE.Points(geo, mat);
}

/* ---------- Markers (HTML elements, re-used between renders) ---------- */
type Marker =
  | { key: string; kind: "place"; lat: number; lng: number; id: string; name: string; color: string }
  | { key: string; kind: "cluster"; lat: number; lng: number; clusterId: number; count: number }
  | { key: string; kind: "me"; lat: number; lng: number }
  | { key: string; kind: "request"; lat: number; lng: number; id: string; label: string; count: number }
  | { key: string; kind: "pick"; lat: number; lng: number; label: string };

interface Engine {
  globe: GlobeInstance;
  material: THREE.ShaderMaterial;
  stars: THREE.Points;
  setIndex(index: Supercluster): void;
  redraw(): void;
}

export default function GlobeCanvas(props: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const latest = useRef(props);

  useEffect(() => {
    latest.current = props;
  });

  // ---- Create the globe once ------------------------------------------------
  useEffect(() => {
    const el = containerRef.current!;
    const globe = new Globe(el, { animateIn: true, rendererConfig: { antialias: true, alpha: true, powerPreference: "high-performance" } });
    const elements = new Map<string, HTMLElement>();
    let clusterIndex: Supercluster | null = null;

    // ----- Day/night material and stars -----
    const loader = new THREE.TextureLoader();
    const tex = (url: string) => {
      const t = loader.load(url);
      t.anisotropy = 8;
      return t;
    };
    const material = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: tex("/textures/earth-day.jpg") },
        nightTex: { value: tex("/textures/earth-night.jpg") },
        night: { value: latest.current.theme === "dark" ? 1 : 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    const stars = makeStars();
    (stars.material as THREE.PointsMaterial).opacity = latest.current.theme === "dark" ? 0.9 : 0;
    globe.scene().add(stars);

    // ----- Markers -----
    const markerElement = (m: Marker): HTMLElement => {
      const cached = elements.get(m.key);
      if (cached) return cached;
      const node = document.createElement("div");
      node.style.pointerEvents = "auto";
      switch (m.kind) {
        case "place":
          node.className = "gm gm--place";
          node.style.setProperty("--c", m.color);
          node.dataset.id = m.id;
          node.innerHTML = `<span class="gm__dot"></span><span class="gm__label"></span>`;
          node.querySelector(".gm__label")!.textContent = m.name;
          node.setAttribute("role", "button");
          node.setAttribute("aria-label", m.name);
          node.addEventListener("click", (e) => {
            e.stopPropagation();
            latest.current.onPlaceClick(m.id);
          });
          break;
        case "cluster": {
          node.className = "gm gm--cluster";
          const size = Math.round(26 + Math.min(26, Math.log2(m.count) * 4.5));
          node.style.setProperty("--size", `${size}px`);
          node.textContent = m.count > 999 ? `${Math.round(m.count / 1000)}k` : String(m.count);
          node.setAttribute("role", "button");
          node.setAttribute("aria-label", `${m.count} places. Zoom in`);
          node.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!clusterIndex) return;
            const z = Math.min(clusterIndex.getClusterExpansionZoom(m.clusterId) + 0.6, 17);
            globe.pointOfView({ lat: m.lat, lng: m.lng, altitude: Math.max(altitudeForZoom(z), 0.03) }, 1100);
          });
          break;
        }
        case "me":
          node.className = "gm gm--me";
          node.style.pointerEvents = "none";
          node.setAttribute("aria-label", "Your location");
          break;
        case "request":
          node.className = "gm gm--request";
          node.innerHTML = `<span class="gm__halo"></span><span class="gm__label"></span>`;
          node.querySelector(".gm__label")!.textContent = `Prayer request · ${m.label}`;
          node.setAttribute("role", "button");
          node.setAttribute("aria-label", `Prayer request from ${m.label}`);
          node.addEventListener("click", (e) => {
            e.stopPropagation();
            latest.current.onRequestClick(m.id);
          });
          break;
        case "pick":
          node.className = "gm gm--pick";
          node.style.pointerEvents = "none";
          node.innerHTML = `<span class="gm__halo"></span><span class="gm__label gm__label--always"></span>`;
          node.querySelector(".gm__label")!.textContent = m.label;
          break;
      }
      elements.set(m.key, node);
      return node;
    };

    /** Clusters + places in view, plus me / requests / picked spot. */
    const redraw = () => {
      if (!clusterIndex) return;
      const { lat, lng, altitude } = globe.pointOfView();
      const zoom = Math.floor(zoomForAltitude(altitude));

      // The visible cap of the globe, as a lat/lng box.
      const radius = (Math.acos(1 / (1 + altitude)) * 180) / Math.PI + 5;
      const minLat = Math.max(-85, lat - radius);
      const maxLat = Math.min(85, lat + radius);
      const lngSpan = Math.abs(lat) + radius >= 85 ? 180 : radius / Math.cos((lat * Math.PI) / 180);
      const bbox: [number, number, number, number] = lngSpan >= 180 ? [-180, minLat, 180, maxLat] : [lng - lngSpan, minLat, lng + lngSpan, maxLat];

      // Hide markers near the horizon, where they'd pile up along the edge.
      const capDeg = (Math.acos(1 / (1 + altitude)) * 180) / Math.PI;
      const center = { lat, lon: lng };
      const facing = (la: number, lo: number) => (distanceKm(center, { lat: la, lon: lo }) / 111.2) < capDeg - 6;

      const markers: Marker[] = [];
      for (const f of clusterIndex.getClusters(bbox, zoom)) {
        const [lon, la] = f.geometry.coordinates;
        if (!facing(la, lon)) continue;
        const p = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string; name?: string; faith?: string };
        if (p.cluster) markers.push({ key: `c:${zoom}:${p.cluster_id}`, kind: "cluster", lat: la, lng: lon, clusterId: p.cluster_id!, count: p.point_count! });
        else markers.push({ key: `p:${p.id}`, kind: "place", lat: la, lng: lon, id: p.id!, name: p.name!, color: faithColor(p.faith!) });
      }

      const { userLocation, requests, pick, selectedId } = latest.current;
      if (requests) {
        for (const r of requests) {
          markers.push({ key: `r:${r.id}`, kind: "request", lat: r.area.lat, lng: r.area.lon, id: r.id, label: r.area.name, count: r.prayedCount });
        }
      }
      if (userLocation) markers.push({ key: "me", kind: "me", lat: userLocation.lat, lng: userLocation.lon });
      if (pick) markers.push({ key: `pick:${pick.lat},${pick.lon}`, kind: "pick", lat: pick.lat, lng: pick.lon, label: pick.label });

      // Forget elements no longer needed.
      const keep = new Set(markers.map((m) => m.key));
      for (const key of elements.keys()) if (!keep.has(key)) elements.delete(key);
      globe.htmlElementsData(markers);
      for (const [key, node] of elements) if (key.startsWith("p:")) node.classList.toggle("is-selected", node.dataset.id === selectedId);
    };

    globe
      .width(el.clientWidth)
      .height(el.clientHeight)
      .backgroundColor("rgba(0,0,0,0)")
      .globeMaterial(material)
      .showAtmosphere(true)
      .atmosphereColor(latest.current.theme === "dark" ? "#5d86ff" : "#8cc8ff")
      .atmosphereAltitude(0.2)
      .onGlobeClick(({ lat, lng }) => latest.current.onGlobeClick(lat, lng))
      // Markers
      .htmlLat("lat")
      .htmlLng("lng")
      .htmlAltitude(0.004)
      .htmlTransitionDuration(0)
      .htmlElement((d) => markerElement(d as Marker))
      // Prayer arcs
      .arcStartLat((d) => (d as ActivityItem).from!.lat)
      .arcStartLng((d) => (d as ActivityItem).from!.lon)
      .arcEndLat((d) => (d as ActivityItem).to.lat)
      .arcEndLng((d) => (d as ActivityItem).to.lon)
      .arcStroke(0.55)
      .arcAltitudeAutoScale(0.45)
      .arcDashLength(0.55)
      .arcDashGap(0.75)
      .arcDashInitialGap(() => Math.random())
      .arcDashAnimateTime(() => 2800 + Math.random() * 2200)
      .arcsTransitionDuration(0)
      // Ripples where prayers arrive
      .ringLat("lat")
      .ringLng("lon")
      .ringMaxRadius(2.6)
      .ringPropagationSpeed(1.4)
      .ringRepeatPeriod(1700)
      // Glow where many prayers go
      .heatmapPointLat("lat")
      .heatmapPointLng("lon")
      .heatmapPointWeight(1)
      .heatmapBandwidth(2.4)
      .heatmapColorSaturation(2.2)
      .heatmapBaseAltitude(0.002)
      .heatmapTopAltitude(0.012)
      .heatmapsTransitionDuration(0);

    applyThemeColors(globe, latest.current.theme);

    // Momentum when you let go, and sensible zoom limits.
    const controls = globe.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 101.5;
    controls.maxDistance = 900;

    const start = latest.current.initialView ?? { lat: 20, lon: 10, altitude: 2.6 };
    globe.pointOfView({ lat: start.lat, lng: start.lon, altitude: start.altitude }, 0);

    // Re-cluster when the view changes (at most once per frame).
    let frame = 0;
    globe.onZoom(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
    });

    const resize = new ResizeObserver(() => globe.width(el.clientWidth).height(el.clientHeight));
    resize.observe(el);

    engineRef.current = {
      globe,
      material,
      stars,
      setIndex: (index) => {
        clusterIndex = index;
        redraw();
      },
      redraw,
    };

    const pov = (p: { lat?: number; lng?: number; altitude?: number }, ms: number) =>
      new Promise<void>((resolve) => {
        globe.pointOfView(p, ms);
        window.setTimeout(resolve, ms + 30);
      });

    let paused = false;
    latest.current.onReady({
      flyTo: (lat, lon, altitude = 1.2, ms = 1800) => pov({ lat, lng: lon, altitude }, ms),
      flyIn: async (lat, lon) => {
        const now = globe.pointOfView();
        const far = Math.abs(now.lat - lat) + Math.abs(now.lng - lon) > 4;
        if (far) await pov({ lat, lng: lon, altitude: Math.max(now.altitude, 1.5) }, 1500);
        await pov({ lat, lng: lon, altitude: 0.04 }, far ? 2300 : 1900);
      },
      flyOut: async () => {
        const now = globe.pointOfView();
        await pov({ lat: now.lat, lng: now.lng, altitude: 2.2 }, 2000);
      },
      setPaused: (p) => {
        if (p === paused) return;
        paused = p;
        if (p) globe.pauseAnimation();
        else globe.resumeAnimation();
      },
      pov: () => globe.pointOfView(),
    });

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      globe._destructor();
      el.innerHTML = "";
      engineRef.current = null;
      elements.clear();
    };
  }, []);

  // ---- Theme: cross-fade day ↔ night ------------------------------------------
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const { material, stars, globe } = engine;
    const from = material.uniforms.night.value as number;
    const to = props.theme === "dark" ? 1 : 0;
    globe.atmosphereColor(to ? "#5d86ff" : "#8cc8ff");
    applyThemeColors(globe, props.theme);
    const startT = performance.now();
    const dur = 1400;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - startT) / dur);
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const v = from + (to - from) * eased;
      material.uniforms.night.value = v;
      (stars.material as THREE.PointsMaterial).opacity = v * 0.9;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [props.theme]);

  // ---- Places: rebuild the cluster index when the (filtered) data changes -------
  useEffect(() => {
    const index = new Supercluster({ radius: 56, maxZoom: 16, minPoints: 3 });
    index.load(
      props.places.map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: { id: f.properties.id, name: f.properties.name, faith: f.properties.faith },
      })),
    );
    engineRef.current?.setIndex(index);
  }, [props.places]);

  // Overlays that change without the camera moving.
  useEffect(() => {
    engineRef.current?.redraw();
  }, [props.userLocation, props.requests, props.pick, props.selectedId]);

  // ---- Prayer arcs, ripples and glow ------------------------------------------
  useEffect(() => {
    const globe = engineRef.current?.globe;
    if (!globe) return;
    const withOrigin = props.activity.filter((a) => a.from);
    globe.arcsData(withOrigin.slice(0, 120));
    globe.ringsData(props.activity.slice(0, 14).map((a) => ({ lat: a.to.lat, lon: a.to.lon })));
    globe.heatmapsData(props.activity.length ? [props.activity.map((a) => ({ lat: a.to.lat, lon: a.to.lon }))] : []);
  }, [props.activity]);

  return <div ref={containerRef} className="globe-canvas" role="application" aria-label="Interactive globe. Drag to spin, scroll to zoom." />;
}

/** Arc, ripple and glow colours: warm gold light at night, deeper amber by day. */
function applyThemeColors(globe: GlobeInstance, theme: "light" | "dark") {
  const dark = theme === "dark";
  globe
    .arcColor(() => (dark ? ["rgba(255,214,140,0.15)", "rgba(255,236,190,1)"] : ["rgba(214,140,40,0.25)", "rgba(190,100,10,1)"]))
    .ringColor(() => (t: number) => (dark ? `rgba(255,220,150,${1 - t})` : `rgba(176,104,20,${0.8 * (1 - t)})`))
    .heatmapColorFn(() => (t: number) => (dark ? `rgba(255,190,90,${Math.min(1, t) * 0.55})` : `rgba(214,120,30,${Math.min(1, t) * 0.4})`));
}
