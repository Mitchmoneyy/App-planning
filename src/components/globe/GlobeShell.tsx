"use client";

/**
 * The home experience: a full-screen globe that stays put while you move
 * between the main screens (home, a place, praying for the world, your area).
 * Screens render as overlays on top of it.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterPanel, { activeFilterCount, EMPTY_FILTERS, type Filters } from "../FilterPanel";
import { useMe } from "../MeProvider";
import NotificationBell from "../NotificationBell";
import SearchBar from "../SearchBar";
import { ThemeToggle, useTheme } from "../ThemeProvider";
import { GlobeContext, type GlobeContextValue } from "./GlobeContext";
import type { GlobeApi } from "./GlobeCanvas";
import { useUserLocation } from "@/hooks/useUserLocation";
import type { ActivityItem, AreaView } from "@/lib/apiTypes";
import { api as fetchApi } from "@/lib/client";
import { distanceKm } from "@/lib/geo";
import { resultTarget, type SearchResult } from "@/lib/search";
import { featureToPlace, type PlaceCollection } from "@/lib/types";

const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), { ssr: false, loading: () => <div className="globe-canvas" /> });

const ACTIVITY_POLL_MS = 30_000;

export default function GlobeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();
  const { me } = useMe();
  const { status: locationStatus, location, request: requestLocation } = useUserLocation();

  const [globeApi, setGlobeApi] = useState<GlobeApi | null>(null);
  const [data, setData] = useState<PlaceCollection | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<{ total: number; last24h: number } | null>(null);
  const [requests, setRequests] = useState<{ id: string; area: AreaView; prayedCount: number }[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [pick, setPick] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const clickHandler = useRef<((lat: number, lon: number) => void) | null>(null);
  const centeredOnUser = useRef(false);

  const placeMatch = pathname.match(/^\/place\/([^/]+)/);
  const selectedId = placeMatch ? decodeURIComponent(placeMatch[1]) : null;
  const immersive = Boolean(selectedId);

  // ---- Places -----------------------------------------------------------------
  useEffect(() => {
    fetch("/data/places.geojson")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ type: "FeatureCollection", features: [] }));
  }, []);
  const places = useMemo(() => (data ? data.features.map(featureToPlace) : []), [data]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  const filteredFeatures = useMemo(
    () =>
      (data?.features ?? []).filter(({ properties: p, geometry }) => {
        if (filters.faiths.length && !filters.faiths.includes(p.faith)) return false;
        if (filters.heritageOnly && !p.heritage) return false;
        if (filters.maxDistanceKm !== null && location) {
          const [lon, lat] = geometry.coordinates;
          if (distanceKm(location, { lat, lon }) > filters.maxDistanceKm) return false;
        }
        return true;
      }),
    [data, filters, location],
  );

  // ---- Prayer activity (arcs, glow, open requests) --------------------------------
  const refreshActivity = useCallback(async () => {
    try {
      const res = await fetchApi<{
        stats: { total: number; last24h: number };
        prayers: ActivityItem[];
        requests: { id: string; area: AreaView; prayedCount: number }[];
      }>("/api/world/activity");
      setStats(res.stats);
      setRequests(res.requests);
      setActivity((prev) => {
        // Keep any just-sent prayers that the server list doesn't include yet.
        const ids = new Set(res.prayers.map((p) => p.id));
        return [...prev.filter((p) => p.id.startsWith("local-") && !ids.has(p.id)), ...res.prayers];
      });
    } catch {
      // keep what we have
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, then poll
    refreshActivity();
    const t = setInterval(() => document.visibilityState === "visible" && refreshActivity(), ACTIVITY_POLL_MS);
    return () => clearInterval(t);
  }, [refreshActivity]);

  const addActivity = useCallback((item: ActivityItem) => setActivity((prev) => [item, ...prev]), []);

  // ---- Start centred on the user (home only, once) ----------------------------------
  useEffect(() => {
    if (!globeApi || !location || centeredOnUser.current) return;
    centeredOnUser.current = true;
    if (pathname === "/") globeApi.flyTo(location.lat, location.lon, 1.9, 2200);
  }, [globeApi, location, pathname]);

  const onLocate = useCallback(() => {
    if (location && globeApi) globeApi.flyTo(location.lat, location.lon, 0.35, 1800);
    else requestLocation();
  }, [location, globeApi, requestLocation]);

  // ---- Search ---------------------------------------------------------------------
  const onSearchPick = useCallback(
    (result: SearchResult) => {
      setShowFilters(false);
      if (result.kind === "place") {
        router.push(`/place/${result.place.id}`);
        return;
      }
      if (!globeApi) return;
      const target = resultTarget(result);
      if ("bounds" in target && target.bounds) {
        const [[w, s], [e, n]] = target.bounds;
        const span = Math.max(e - w, n - s);
        globeApi.flyTo((s + n) / 2, (w + e) / 2, Math.min(2.4, Math.max(0.12, span / 28)), 2000);
      } else if ("center" in target) {
        globeApi.flyTo(target.center.lat, target.center.lon, result.kind === "city" ? 0.1 : 0.6, 2000);
      }
    },
    [globeApi, router],
  );

  const ctx: GlobeContextValue = useMemo(
    () => ({
      api: globeApi,
      places,
      placeById,
      location,
      locationStatus,
      requestLocation,
      activity,
      stats,
      addActivity,
      refreshActivity,
      setGlobeClickHandler: (h) => {
        clickHandler.current = h;
      },
      setPick,
      setShowRequests,
    }),
    [globeApi, places, placeById, location, locationStatus, requestLocation, activity, stats, addActivity, refreshActivity],
  );

  // Deep link straight to a place: start the camera above it.
  const [initialPlaceId] = useState(selectedId);
  const initialView = useMemo(() => {
    const id = initialPlaceId;
    const p = id ? data?.features.find((f) => f.properties.id === id) : null;
    return p ? { lat: p.geometry.coordinates[1], lon: p.geometry.coordinates[0], altitude: 2.4 } : undefined;
  }, [data, initialPlaceId]);

  const filterCount = activeFilterCount(filters);

  return (
    <GlobeContext.Provider value={ctx}>
      <div className={`shell${immersive ? " is-immersive" : ""}${/^\/(world|area)/.test(pathname) ? " has-panel" : ""}`}>
        <div className="space" aria-hidden="true" />
        {data && (
          <GlobeCanvas
            places={filteredFeatures}
            theme={theme}
            userLocation={location}
            selectedId={selectedId}
            activity={activity}
            requests={showRequests ? requests : null}
            pick={pick}
            initialView={initialView}
            onReady={setGlobeApi}
            onPlaceClick={(id) => router.push(`/place/${id}`)}
            onRequestClick={(id) => router.push(`/world/requests/${id}`)}
            onGlobeClick={(lat, lon) => clickHandler.current?.(lat, lon)}
          />
        )}

        {!immersive && (
          <header className="topbar-d">
            <Link href="/" className="brand-d">
              <span className="brand-d__mark" aria-hidden="true">
                ✦
              </span>
              Global Sanctuary
            </Link>

            <div className="topbar-d__search">
              <SearchBar places={places} onPick={onSearchPick} />
              <button
                type="button"
                className={`pill${filterCount ? " is-on" : ""}`}
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
              >
                Filters{filterCount > 0 && <span className="badge">{filterCount}</span>}
              </button>
            </div>

            <nav className="topbar-d__nav" aria-label="Main">
              <Link href="/world" className={`pill pill--glow${pathname.startsWith("/world") ? " is-on" : ""}`}>
                <span aria-hidden="true">✧</span> Pray for the world
              </Link>
              <Link href="/area" className={`pill${pathname === "/area" ? " is-on" : ""}`}>
                Prayers for your area
              </Link>
              <ThemeToggle />
              <NotificationBell />
              <Link href="/me" className="icon-pill" aria-label="My sanctuary" title={me?.user ? me.user.displayName : "My sanctuary"}>
                {me?.user ? (
                  <span className="avatar">{me.user.displayName.slice(0, 1).toUpperCase()}</span>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M4.5 20c1.2-3.8 4.2-5.5 7.5-5.5s6.3 1.7 7.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                )}
              </Link>
            </nav>
          </header>
        )}

        {showFilters && !immersive && (
          <div className="filters-pop">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              hasLocation={!!location}
              resultCount={filteredFeatures.length}
              onClose={() => setShowFilters(false)}
            />
          </div>
        )}

        {!immersive && (
          <div className="globe-tools">
            <button type="button" className="icon-pill" onClick={onLocate} title="Return to my location" aria-label="Return to my location">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="12" cy="12" r="3.5" fill="currentColor" />
                <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <button type="button" className="icon-pill" onClick={() => globeApi?.flyTo(globeApi.pov().lat, globeApi.pov().lng, 2.6, 1600)} title="Zoom out to the whole world" aria-label="Zoom out to the whole world">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        )}

        {!immersive && <LocationNote status={locationStatus} />}

        {!immersive && stats && (
          <Link href="/world" className="live-count">
            <span className="live-count__dot" aria-hidden="true" />
            {stats.last24h > 0
              ? `${stats.last24h.toLocaleString()} prayer${stats.last24h === 1 ? "" : "s"} sent around the world today`
              : "Be the first to send a prayer today"}
          </Link>
        )}

        {children}

        <p className="globe-credit">
          Imagery: NASA · Places: Wikidata, OpenStreetMap · Cities: GeoNames
        </p>
      </div>
    </GlobeContext.Provider>
  );
}

function LocationNote({ status }: { status: string }) {
  const [dismissed, setDismissed] = useState(false);
  const message =
    status === "locating"
      ? "Finding your location…"
      : status === "denied"
        ? "Location is off, so the globe starts with the whole world."
        : status === "unavailable"
          ? "We couldn't find your location."
          : null;
  if (!message || dismissed) return null;
  return (
    <div className="toast" role="status">
      {message}
      {status !== "locating" && (
        <button type="button" className="icon-button" onClick={() => setDismissed(true)} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
