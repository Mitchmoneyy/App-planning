"use client";

/** Last-resort view: a tilted 3D street map that slowly circles the place. */
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { resolveMapStyle } from "@/lib/mapStyle";

export default function ImmersiveMap({ lat, lon, color }: { lat: number; lon: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    let raf = 0;
    resolveMapStyle({ globe: false }).then(({ style, offline }) => {
      if (cancelled || !ref.current) return;
      map = new maplibregl.Map({
        container: ref.current,
        style,
        center: [lon, lat],
        zoom: offline ? 6 : 16.6,
        pitch: offline ? 0 : 62,
        bearing: -20,
        interactive: true,
        attributionControl: { compact: true },
      });
      new maplibregl.Marker({ color }).setLngLat([lon, lat]).addTo(map);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Slowly circle the building until the user takes over.
      const spin = () => {
        if (!map) return;
        map.setBearing(map.getBearing() + 0.04);
        raf = requestAnimationFrame(spin);
      };
      map.on("load", () => {
        if (!reduce) raf = requestAnimationFrame(spin);
      });
      map.on("mousedown", () => cancelAnimationFrame(raf));
      map.on("touchstart", () => cancelAnimationFrame(raf));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      map?.remove();
    };
  }, [lat, lon, color]);

  return <div ref={ref} className="immersive-map" />;
}
