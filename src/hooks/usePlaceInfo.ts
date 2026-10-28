"use client";

/** History, facts, photos and panoramas for a place (fetched once per page view). */
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { PlaceInfo } from "@/server/wikimedia";

const cache = new Map<string, Promise<PlaceInfo>>();

function load(id: string) {
  if (!cache.has(id)) {
    const p = api<PlaceInfo>(`/api/places/${id}/info`).catch((err) => {
      cache.delete(id);
      throw err;
    });
    cache.set(id, p);
  }
  return cache.get(id)!;
}

export function usePlaceInfo(placeId: string) {
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    load(placeId)
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [placeId]);
  return { info, failed, loading: !info && !failed };
}
