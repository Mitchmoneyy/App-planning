"use client";

/** Loads the world cities dataset once (only on pages that need it). */
import { useEffect, useState } from "react";
import { CityIndex, type CityData } from "@/lib/cities";

let promise: Promise<CityIndex> | null = null;

export function loadCityIndex() {
  promise ??= fetch("/data/cities.json")
    .then((r) => r.json() as Promise<CityData>)
    .then((d) => new CityIndex(d))
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}

export function useCityIndex() {
  const [index, setIndex] = useState<CityIndex | null>(null);
  useEffect(() => {
    let alive = true;
    loadCityIndex()
      .then((i) => alive && setIndex(i))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return index;
}
