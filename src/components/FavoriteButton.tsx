"use client";

import { useMe } from "./MeProvider";

/** Heart toggle to save a place. Works without an account. */
export default function FavoriteButton({ placeId, compact = false }: { placeId: string; compact?: boolean }) {
  const { isFavorite, setFavorite, me } = useMe();
  const on = isFavorite(placeId);
  return (
    <button
      type="button"
      className={`favorite-button${on ? " is-on" : ""}${compact ? " is-compact" : ""}`}
      aria-pressed={on}
      disabled={!me}
      onClick={() => setFavorite(placeId, !on)}
      title={on ? "Remove from saved places" : "Save this place"}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && <span className="favorite-button__label">{on ? "Saved" : "Save"}</span>}
    </button>
  );
}
