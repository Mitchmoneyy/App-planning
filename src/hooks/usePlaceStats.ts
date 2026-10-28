"use client";

/**
 * Live candle / prayer counts for a place. Polls every 15 s while the tab is
 * visible, which feels live without needing a realtime service.
 */
import { useCallback, useEffect, useState } from "react";
import type { PlaceStatsView } from "@/lib/apiTypes";
import { api } from "@/lib/client";

const POLL_MS = 15_000;

export function usePlaceStats(placeId: string) {
  const [stats, setStats] = useState<PlaceStatsView | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await api<PlaceStatsView>(`/api/places/${placeId}/stats`));
    } catch {
      // keep the last known numbers
    }
  }, [placeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { stats, setStats, refresh };
}
