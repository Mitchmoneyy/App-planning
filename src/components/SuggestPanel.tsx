"use client";

/** Add a missing place of worship: zoom in, click the building, fill in the details. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGlobe } from "./globe/GlobeContext";
import SuggestForm from "./SuggestForm";

export default function SuggestPanel() {
  const { api: globe, setGlobeClickHandler, setPick } = useGlobe();
  const [spot, setSpot] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    setGlobeClickHandler((lat, lon) => {
      setSpot({ lat, lon });
      setPick({ lat, lon, label: "New place" });
      const zoom = globe?.pov().zoom ?? 0;
      if (zoom < 15) globe?.flyTo(lat, lon, Math.max(zoom + 3, 16), 1600);
    });
    return () => {
      setGlobeClickHandler(null);
      setPick(null);
    };
  }, [globe, setGlobeClickHandler, setPick]);

  return (
    <aside className="side-panel panel-glass" aria-label="Add a place of worship">
      <header className="side-panel__head">
        <Link href="/" className="close-x" aria-label="Close">
          ×
        </Link>
        <p className="eyebrow">Help complete the map</p>
        <h1>Add a place of worship</h1>
        <p className="muted">
          Small chapels, house churches, prayer rooms and village temples are often missing from maps. Zoom in, click the building, and tell us about it.
        </p>
      </header>
      <div className="side-panel__scroll">
        <SuggestForm spot={spot} />
      </div>
    </aside>
  );
}
