"use client";

import { useCallback, useEffect, useState } from "react";
import type { LngLat } from "@/lib/types";

export type LocationStatus = "idle" | "locating" | "found" | "denied" | "unavailable";

/**
 * Asks the browser for the user's location, once on mount unless
 * `auto: false` (then only when `request()` is called, or if permission was
 * already granted earlier). Coarse accuracy is enough and saves battery.
 */
export function useUserLocation({ auto = true }: { auto?: boolean } = {}) {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [location, setLocation] = useState<LngLat | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setStatus("found");
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    if (auto) {
      // Asking on load is part of the core experience: the globe opens on "you".
      // eslint-disable-next-line react-hooks/set-state-in-effect
      request();
      return;
    }
    // Otherwise only use location silently if the user already allowed it.
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") request();
      })
      .catch(() => {});
  }, [auto, request]);

  return { status, location, request };
}
