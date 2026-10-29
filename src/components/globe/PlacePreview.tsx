"use client";

/**
 * The card that pops up when you click a place on the map: what it is,
 * where it is, a photo and a few lines of history when we have them, and the
 * ways in (arrive and look around, pray, directions, save).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FavoriteButton from "../FavoriteButton";
import type { PlaceSummary } from "./GlobeMap";
import { usePlaceInfo } from "@/hooks/usePlaceInfo";
import { api } from "@/lib/client";
import { faithColor, faithLabel } from "@/lib/faiths";
import { distanceKm, formatDistance } from "@/lib/geo";
import { gesturesFor } from "@/lib/gestures";
import { faithIconUrl } from "@/lib/map/icons";
import type { LngLat, Place } from "@/lib/types";

interface Props {
  summary: PlaceSummary;
  userLocation: LngLat | null;
  onClose(): void;
  /** Called once full details (with the building outline) arrive, to highlight it. */
  onDetails?(place: Place): void;
}

export default function PlacePreview({ summary, userLocation, onClose, onDetails }: Props) {
  const [place, setPlace] = useState<Place | null>(null);
  const [failed, setFailed] = useState(false);
  const { info, loading: infoLoading } = usePlaceInfo(summary.id);
  // Only ever shown after a click (never in server HTML), so the canvas-drawn icon is safe here.
  const icon = useMemo(() => faithIconUrl(summary.faith), [summary.faith]);

  useEffect(() => {
    // One card per place (it's keyed by id), so nothing to reset here.
    let alive = true;
    api<{ places: Place[] }>(`/api/places/lookup?ids=${encodeURIComponent(summary.id)}`)
      .then((r) => {
        if (!alive) return;
        const p = r.places[0] ?? null;
        setPlace(p);
        setFailed(!p);
        if (p) onDetails?.(p);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the place changes
  }, [summary.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = place;
  const name = p?.name ?? summary.name;
  const where = p ? [p.address, p.city, p.country].filter(Boolean).join(", ") : "";
  const coords = `${summary.lat.toFixed(6)},${summary.lon.toFixed(6)}`;
  const away = userLocation ? formatDistance(distanceKm(userLocation, { lat: summary.lat, lon: summary.lon })) : null;
  const photo = info?.photos[0] ?? null;
  const blurb = info?.description ?? (info?.summary ? info.summary.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : null);
  const gesture = gesturesFor(summary.faith, p?.tradition)[0];
  const website = info?.website ?? p?.website ?? null;
  const href = `/place/${encodeURIComponent(summary.id)}`;

  return (
    <section className="place-preview panel-glass" aria-label={name} role="dialog">
      <button type="button" className="close-x place-preview__close" onClick={onClose} aria-label="Close">
        ×
      </button>

      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- remote Commons thumbnail, credited below
        <img className="place-preview__photo" src={photo.thumbUrl} alt={photo.title} loading="lazy" />
      )}

      <div className="place-preview__body">
        <p className="faith-tag">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={icon} alt="" width={18} height={18} style={{ background: faithColor(summary.faith), borderRadius: "50%" }} />
          {faithLabel(summary.faith)}
          {p?.tradition && p.tradition !== faithLabel(summary.faith) && <> · {p.tradition}</>}
          {p?.heritage && <span className="heritage-mini">UNESCO World Heritage</span>}
        </p>
        <h2 className="place-preview__name">{name}</h2>
        <p className="place-preview__where">
          {where || (failed ? "" : p ? "Address not listed yet" : "…")}
          {away && <span className="place-preview__away"> · {away} away</span>}
        </p>

        {blurb && <p className="place-preview__blurb">{blurb}</p>}
        {!blurb && !infoLoading && p && (
          <p className="place-preview__blurb muted">
            No history written for this place yet. <Link href={`${href}?tab=visit#suggest`}>Know it? Add details</Link>
          </p>
        )}

        <div className="place-preview__actions">
          <Link href={href} className="primary-button">
            Arrive &amp; look around
          </Link>
          <Link href={`${href}?tab=pray`} className="secondary-button">
            {gesture.action}
          </Link>
          <FavoriteButton placeId={summary.id} />
        </div>

        <p className="link-row place-preview__links">
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${coords}`} target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
          <a href={`https://maps.apple.com/?daddr=${coords}&q=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer">
            Apple Maps
          </a>
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer">
              Website
            </a>
          )}
        </p>
        {photo && (
          <p className="place-preview__credit">
            Photo: {photo.author ? `${photo.author}, ` : ""}
            {photo.license ?? "Wikimedia Commons"}
          </p>
        )}
      </div>
    </section>
  );
}
