"use client";

/** Looks up a few places by id (any of the 1.5M+, not just landmarks). */
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Place } from "@/lib/types";

export function usePlacesById(ids: string[]) {
  const key = [...new Set(ids)].sort().join(",");
  const [places, setPlaces] = useState<{ key: string; map: Map<string, Place> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    api<{ places: Place[] }>(`/api/places/lookup?ids=${encodeURIComponent(key)}`)
      .then((r) => alive && setPlaces({ key, map: new Map(r.places.map((p) => [p.id, p])) }))
      .catch(() => alive && setPlaces({ key, map: new Map() }));
    return () => {
      alive = false;
    };
  }, [key]);
  if (!key) return new Map<string, Place>();
  return places?.key === key ? places.map : null;
}
