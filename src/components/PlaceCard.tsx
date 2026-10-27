"use client";

/** Preview card shown when a place is tapped on the globe. */
import Link from "next/link";
import { faithColor, faithLabel } from "@/lib/faiths";
import { distanceKm, formatDistance } from "@/lib/geo";
import type { LngLat, Place } from "@/lib/types";

interface Props {
  place: Place;
  userLocation: LngLat | null;
  onClose(): void;
}

export default function PlaceCard({ place, userLocation, onClose }: Props) {
  const where = [place.city, place.country].filter(Boolean).join(", ");

  return (
    <article className="panel place-card" aria-label={place.name}>
      <button type="button" className="icon-button place-card__close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <p className="faith-tag">
        <span className="chip__dot" style={{ background: faithColor(place.faith) }} aria-hidden="true" />
        {faithLabel(place.faith)}
        {place.tradition && place.tradition !== faithLabel(place.faith) && <> · {place.tradition}</>}
      </p>
      <h2 className="place-card__title">{place.name}</h2>
      <p className="place-card__meta">
        {where}
        {userLocation && <> · {formatDistance(distanceKm(userLocation, place))} away</>}
      </p>
      {place.heritage && <p className="heritage-badge">UNESCO World Heritage</p>}

      <Link className="primary-button" href={`/place/${place.id}`}>
        Visit this place
      </Link>
    </article>
  );
}
