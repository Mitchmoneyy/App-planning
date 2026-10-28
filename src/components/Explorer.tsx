"use client";

/**
 * Home screen: the globe plus search, filters, location and the place card.
 * Owns the app state; the globe itself is in GlobeMap.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUserLocation } from "@/hooks/useUserLocation";
import { distanceKm } from "@/lib/geo";
import { resultTarget, type SearchResult } from "@/lib/search";
import { featureToPlace, type PlaceCollection } from "@/lib/types";
import FilterPanel, { activeFilterCount, EMPTY_FILTERS, type Filters } from "./FilterPanel";
import type { GlobeApi } from "./GlobeMap";
import PlaceCard from "./PlaceCard";
import SearchBar from "./SearchBar";

// WebGL map: browser only, never server-rendered.
const GlobeMap = dynamic(() => import("./GlobeMap"), { ssr: false });

/** Zoom used when centering on the user: their region, with the globe's curve still visible. */
const HOME_ZOOM = 2.6;
const LOCATE_ZOOM = 9;

export default function Explorer() {
  const [data, setData] = useState<PlaceCollection | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [globe, setGlobe] = useState<GlobeApi | null>(null);
  const { status, location, request } = useUserLocation();

  const centeredOnUser = useRef(false); // only auto-center once on open
  const wantsLocate = useRef(false); // locate button pressed before location known
  const openedFromLink = useRef(false); // ?place=… overrides auto-centering

  // ---- Load the places dataset -------------------------------------------
  useEffect(() => {
    fetch("/data/places.geojson")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setLoadError(true));
  }, []);

  const allPlaces = useMemo(() => (data ? data.features.map(featureToPlace) : []), [data]);
  const placeById = useMemo(() => new Map(allPlaces.map((p) => [p.id, p])), [allPlaces]);

  // ---- Apply filters -----------------------------------------------------
  const filtered = useMemo<PlaceCollection>(() => {
    const features = (data?.features ?? []).filter(({ properties: p, geometry }) => {
      if (filters.faiths.length && !filters.faiths.includes(p.faith)) return false;
      if (filters.heritageOnly && !p.heritage) return false;
      if (filters.maxDistanceKm !== null && location) {
        const [lon, lat] = geometry.coordinates;
        if (distanceKm(location, { lon, lat }) > filters.maxDistanceKm) return false;
      }
      return true;
    });
    return { type: "FeatureCollection", features };
  }, [data, filters, location]);

  // ---- Deep link: /?place=<id> opens with that place selected ---------------
  useEffect(() => {
    if (!globe || !data) return;
    const id = new URLSearchParams(window.location.search).get("place");
    const place = id ? placeById.get(id) : undefined;
    if (place && !openedFromLink.current) {
      openedFromLink.current = true;
      setSelectedId(place.id);
      globe.flyTo(place, 12);
    }
  }, [globe, data, placeById]);

  // ---- Center on the user when their location arrives ----------------------
  useEffect(() => {
    if (!globe || !location) return;
    if (wantsLocate.current) {
      wantsLocate.current = false;
      globe.flyTo(location, LOCATE_ZOOM);
    } else if (!centeredOnUser.current && !openedFromLink.current) {
      globe.flyTo(location, HOME_ZOOM);
    }
    centeredOnUser.current = true;
  }, [globe, location]);

  const onLocateClick = useCallback(() => {
    if (location && globe) {
      globe.flyTo(location, LOCATE_ZOOM);
    } else {
      wantsLocate.current = true;
      request();
    }
  }, [location, globe, request]);

  const onSearchPick = useCallback(
    (result: SearchResult) => {
      if (!globe) return;
      const target = resultTarget(result);
      if ("bounds" in target && target.bounds) globe.fitBounds(target.bounds);
      else if ("center" in target) globe.flyTo(target.center, target.zoom);
      setSelectedId(result.kind === "place" ? result.place.id : null);
      setShowFilters(false);
    },
    [globe],
  );

  const selected = selectedId ? placeById.get(selectedId) ?? null : null;
  const filterCount = activeFilterCount(filters);

  return (
    <main className="explorer">
      <GlobeMap
        places={filtered}
        selectedId={selectedId}
        userLocation={location}
        onSelect={setSelectedId}
        onReady={setGlobe}
        onLocateClick={onLocateClick}
      />

      <div className="topbar">
        <h1 className="brand">
          <span className="brand__mark" aria-hidden="true">✦</span> Global Sanctuary
        </h1>
        <div className="topbar__row">
          <SearchBar places={allPlaces} onPick={onSearchPick} />
          <button
            type="button"
            className={`filter-button${filterCount ? " is-on" : ""}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            Filters{filterCount > 0 && <span className="badge">{filterCount}</span>}
          </button>
          <Link href="/me" className="me-button" aria-label="My sanctuary: saved places and prayers" title="My sanctuary">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M4.5 20c1.2-3.8 4.2-5.5 7.5-5.5s6.3 1.7 7.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </div>

      {!showFilters && <StatusNote status={status} loadError={loadError} offline={globe?.offline ?? false} loading={!data || !globe} />}

      {showFilters && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          hasLocation={!!location}
          resultCount={filtered.features.length}
          onClose={() => setShowFilters(false)}
        />
      )}

      {selected && !showFilters && <PlaceCard place={selected} userLocation={location} onClose={() => setSelectedId(null)} />}
    </main>
  );
}

/** Small, unobtrusive status line (loading, location, offline map). */
function StatusNote({ status, loadError, offline, loading }: { status: string; loadError: boolean; offline: boolean; loading: boolean }) {
  const [dismissed, setDismissed] = useState<string | null>(null);

  let message: string | null = null;
  if (loadError) message = "Couldn't load places. Please refresh to try again.";
  else if (loading) message = "Preparing the globe…";
  else if (status === "locating") message = "Finding your location…";
  else if (status === "denied") message = "Location is off — showing the whole world.";
  else if (status === "unavailable") message = "Couldn't find you — showing the whole world.";
  else if (offline) message = "Showing a simplified map.";

  if (!message || dismissed === message) return null;
  return (
    <div className="status-note" role="status">
      {message}
      {!loading && (
        <button type="button" className="icon-button" onClick={() => setDismissed(message)} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
