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
import type { GlobeApi, GlobeFilters, PlaceSummary } from "./GlobeMap";
import { useUserLocation } from "@/hooks/useUserLocation";
import type { ActivityItem, AreaView, SearchHit } from "@/lib/apiTypes";
import { api as fetchApi } from "@/lib/client";
import type { FaithKey } from "@/lib/faiths";
import { mapProvider } from "@/lib/map/style";

const GlobeMap = dynamic(() => import("./GlobeMap"), { ssr: false, loading: () => <div className="globe-canvas" /> });

const CREDITS = {
  mapbox: "Imagery © Mapbox, Maxar · Night lights: NASA",
  maptiler: "Imagery © MapTiler · Night lights: NASA",
  free: "Imagery: NASA, Sentinel-2 cloudless by EOX",
} as const;

const ACTIVITY_POLL_MS = 30_000;

export default function GlobeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();
  const { me } = useMe();
  const { status: locationStatus, location, request: requestLocation } = useUserLocation();

  const [globeApi, setGlobeApi] = useState<GlobeApi | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<{ total: number; last24h: number } | null>(null);
  const [requests, setRequests] = useState<{ id: string; area: AreaView; prayedCount: number }[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [pick, setPick] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const clickHandler = useRef<((lat: number, lon: number) => void) | null>(null);
  const centeredOnUser = useRef(false);

  const immersive = /^\/place\/[^/]+/.test(pathname);

  // Filters run on the map itself (GPU expressions over the vector tiles).
  const globeFilters: GlobeFilters = useMemo(
    () => ({
      faiths: filters.faiths,
      landmarksOnly: filters.heritageOnly,
      near: filters.maxDistanceKm !== null && location ? { lat: location.lat, lon: location.lon, km: filters.maxDistanceKm } : null,
    }),
    [filters, location],
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
    if (pathname === "/") globeApi.flyTo(location.lat, location.lon, 2.6, 2200);
  }, [globeApi, location, pathname]);

  const onLocate = useCallback(() => {
    if (location && globeApi) globeApi.flyTo(location.lat, location.lon, 13, 2400);
    else requestLocation();
  }, [location, globeApi, requestLocation]);

  // ---- Search ---------------------------------------------------------------------
  const onSearchPick = useCallback(
    (hit: SearchHit, faith: FaithKey | null) => {
      setShowFilters(false);
      if (faith) setFilters((f) => ({ ...f, faiths: [faith] }));
      if (hit.kind === "place") {
        router.push(`/place/${encodeURIComponent(hit.id)}`);
        return;
      }
      globeApi?.flyTo(hit.lat, hit.lon, hit.kind === "city" ? 12 : 4.6, 2600);
    },
    [globeApi, router],
  );

  const onPlaceClick = useCallback((p: PlaceSummary) => router.push(`/place/${encodeURIComponent(p.id)}`), [router]);

  const ctx: GlobeContextValue = useMemo(
    () => ({
      api: globeApi,
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
    [globeApi, location, locationStatus, requestLocation, activity, stats, addActivity, refreshActivity],
  );

  const filterCount = activeFilterCount(filters);

  return (
    <GlobeContext.Provider value={ctx}>
      <div className={`shell${immersive ? " is-immersive" : ""}${/^\/(world|area|suggest)/.test(pathname) ? " has-panel" : ""}`}>
        <div className="space" aria-hidden="true" />
        <GlobeMap
          theme={theme}
          userLocation={location}
          selected={null}
          activity={activity}
          requests={showRequests ? requests : null}
          pick={pick}
          filters={globeFilters}
          onReady={setGlobeApi}
          onPlaceClick={onPlaceClick}
          onRequestClick={(id) => router.push(`/world/requests/${id}`)}
          onGlobeClick={(lat, lon) => clickHandler.current?.(lat, lon)}
        />

        {!immersive && (
          <header className="topbar-d">
            <Link href="/" className="brand-d">
              <span className="brand-d__mark" aria-hidden="true">
                ✦
              </span>
              Global Sanctuary
            </Link>

            <div className="topbar-d__search">
              <SearchBar nearby={() => globeApi?.loadedPlaces() ?? []} near={location} onPick={onSearchPick} />
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
              <Link href="/world" className={`pill pill--glow nav-section${pathname.startsWith("/world") ? " is-on" : ""}`}>
                <span aria-hidden="true">✧</span> Pray for the world
              </Link>
              <Link href="/area" className={`pill nav-section${pathname === "/area" ? " is-on" : ""}`}>
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
            <button type="button" className="icon-pill" onClick={() => globeApi?.flyTo(globeApi.pov().lat, globeApi.pov().lng, 1.4, 2000)} title="Zoom out to the whole world" aria-label="Zoom out to the whole world">
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

        {!immersive && (
          <nav className="bottom-nav" aria-label="Sections">
            <Link href="/" className={pathname === "/" ? "is-on" : ""}>
              <span aria-hidden="true">◍</span>
              Globe
            </Link>
            <Link href="/world" className={pathname.startsWith("/world") ? "is-on" : ""}>
              <span aria-hidden="true">✧</span>
              Pray for the world
            </Link>
            <Link href="/area" className={pathname === "/area" ? "is-on" : ""}>
              <span aria-hidden="true">♡</span>
              Your area
            </Link>
            <Link href="/me" className={pathname === "/me" ? "is-on" : ""}>
              <span aria-hidden="true">☺</span>
              Me
            </Link>
          </nav>
        )}

        <p className="globe-credit">{CREDITS[mapProvider()]} · Places: OpenStreetMap, Overture Maps, Wikidata · Cities: GeoNames</p>
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
