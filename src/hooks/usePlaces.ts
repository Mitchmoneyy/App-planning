"use client";

/** Loads the places dataset once per page (the browser caches the file). */
import { useEffect, useState } from "react";
import { featureToPlace, type Place, type PlaceCollection } from "@/lib/types";

let promise: Promise<Map<string, Place>> | null = null;

function loadPlaces() {
  promise ??= fetch("/data/places.geojson")
    .then((r) => r.json() as Promise<PlaceCollection>)
    .then((d) => new Map(d.features.map((f) => [f.properties.id, featureToPlace(f)])))
    .catch((err) => {
      promise = null;
      throw err;
    });
  return promise;
}

export function usePlaces() {
  const [places, setPlaces] = useState<Map<string, Place> | null>(null);
  useEffect(() => {
    loadPlaces()
      .then(setPlaces)
      .catch(() => setPlaces(new Map()));
  }, []);
  return places;
}
