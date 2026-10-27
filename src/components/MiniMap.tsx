"use client";

/** Small flat map with a single pin, for the place detail page. */
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { resolveMapStyle } from "@/lib/mapStyle";

interface Props {
  lat: number;
  lon: number;
  color: string;
  label: string;
}

export default function MiniMap({ lat, lon, color, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;

    resolveMapStyle({ globe: false }).then(({ style, offline }) => {
      if (cancelled || !ref.current) return;
      map = new maplibregl.Map({
        container: ref.current,
        style,
        center: [lon, lat],
        zoom: offline ? 5 : 15, // the offline map only has country outlines
        cooperativeGestures: true, // page scrolls normally; two fingers / ctrl to move the map
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      new maplibregl.Marker({ color }).setLngLat([lon, lat]).addTo(map);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon, color]);

  return <div ref={ref} className="mini-map" role="img" aria-label={`Map showing the location of ${label}`} />;
}
