"use client";

/** Shared state between the always-mounted globe and the screens over it. */
import { createContext, useContext } from "react";
import type { ActivityItem } from "@/lib/apiTypes";
import type { LngLat, Place } from "@/lib/types";
import type { LocationStatus } from "@/hooks/useUserLocation";
import type { GlobeApi } from "./GlobeCanvas";

export interface GlobeContextValue {
  /** null until the globe has loaded. */
  api: GlobeApi | null;
  places: Place[];
  placeById: Map<string, Place>;
  location: LngLat | null;
  locationStatus: LocationStatus;
  requestLocation(): void;
  activity: ActivityItem[];
  stats: { total: number; last24h: number } | null;
  /** Show a prayer travelling right away, before the next refresh. */
  addActivity(item: ActivityItem): void;
  refreshActivity(): void;
  /** Screens can take over globe clicks (e.g. to pick where to send a prayer). */
  setGlobeClickHandler(handler: ((lat: number, lon: number) => void) | null): void;
  setPick(pick: { lat: number; lon: number; label: string } | null): void;
  /** Show open prayer requests as lights on the globe. */
  setShowRequests(show: boolean): void;
}

export const GlobeContext = createContext<GlobeContextValue | null>(null);

export function useGlobe() {
  const ctx = useContext(GlobeContext);
  if (!ctx) throw new Error("useGlobe must be used inside the globe layout");
  return ctx;
}
