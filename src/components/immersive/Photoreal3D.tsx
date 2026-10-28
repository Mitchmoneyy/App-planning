"use client";

/**
 * Google Photorealistic 3D Tiles around a place, slowly orbiting the building.
 *
 * Rendered with CesiumJS (Google's reference renderer), loaded from a CDN only
 * when this view opens, so it costs nothing until someone uses it. Shown on
 * its own (never mixed with other providers' map data, per Google's terms),
 * with Google's attribution displayed by Cesium.
 *
 * Needs NEXT_PUBLIC_GOOGLE_MAPS_3D_KEY: a browser key restricted to the Map
 * Tiles API and your site's domain. Billing is per 3D session (see README).
 */
import { useEffect, useRef, useState } from "react";

const CESIUM_VERSION = "1.135.0";
const CDN = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium`;

/* eslint-disable @typescript-eslint/no-explicit-any -- Cesium is loaded at runtime from the CDN */
declare global {
  interface Window {
    Cesium?: any;
    CESIUM_BASE_URL?: string;
  }
}

let loading: Promise<any> | null = null;
function loadCesium(): Promise<any> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  loading ??= new Promise((resolve, reject) => {
    window.CESIUM_BASE_URL = `${CDN}/`;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${CDN}/Widgets/widgets.css`;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = `${CDN}/Cesium.js`;
    s.async = true;
    s.onload = () => resolve(window.Cesium);
    s.onerror = () => {
      loading = null;
      reject(new Error("Cesium failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const photorealAvailable = () => Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_3D_KEY);

export default function Photoreal3D({ lat, lon, name, onFail }: { lat: number; lon: number; name: string; onFail(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let viewer: any = null;
    let cancelled = false;
    let removeTick: (() => void) | null = null;
    (async () => {
      try {
        const Cesium = await loadCesium();
        if (cancelled || !ref.current) return;
        Cesium.GoogleMaps.defaultApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_3D_KEY;
        Cesium.Ion.defaultAccessToken = undefined;
        viewer = new Cesium.Viewer(ref.current, {
          baseLayer: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          requestRenderMode: false,
        });
        viewer.scene.globe.show = false;
        viewer.scene.skyAtmosphere.show = true;
        viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
        const tileset = await Cesium.createGooglePhotorealistic3DTileset({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_3D_KEY, onlyUsingWithGoogleGeocoder: true });
        if (cancelled) return;
        viewer.scene.primitives.add(tileset);

        // Find the ground height at the building, then orbit it slowly.
        let target = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
        try {
          const [clamped] = await viewer.scene.clampToHeightMostDetailed([target]);
          if (clamped) target = clamped;
        } catch {
          // keep sea-level target
        }
        if (cancelled) return;
        let heading = Cesium.Math.toRadians(-30);
        const range = 320;
        const pitch = Cesium.Math.toRadians(-28);
        viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
        removeTick = viewer.clock.onTick.addEventListener(() => {
          heading += 0.0009;
          viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
        });
        // Let people take over: stop orbiting on first touch.
        const stop = () => {
          removeTick?.();
          removeTick = null;
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        };
        ref.current?.addEventListener("pointerdown", stop, { once: true });
        ref.current?.addEventListener("wheel", stop, { once: true });
        setStatus("ready");
      } catch (err) {
        console.warn("Photorealistic 3D unavailable", err);
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      removeTick?.();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [lat, lon, onFail]);

  return (
    <div className="photoreal" aria-label={`Photorealistic 3D view of ${name}`}>
      <div ref={ref} className="photoreal__canvas" />
      {status === "loading" && <p className="photoreal__loading">Loading 3D view…</p>}
    </div>
  );
}
