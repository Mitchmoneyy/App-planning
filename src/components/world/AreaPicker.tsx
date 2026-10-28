"use client";

/**
 * Choose a city or country: search by name, or use your location (rounded to
 * the nearest city in the browser; the exact position never leaves the device).
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useCityIndex } from "@/hooks/useCityIndex";
import { useUserLocation } from "@/hooks/useUserLocation";
import type { Area } from "@/lib/cities";

export const flag = (cc: string) =>
  /^[A-Z]{2}$/i.test(cc) ? String.fromCodePoint(...cc.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0))) : "";

interface Props {
  value: Area | null;
  onChange(area: Area | null): void;
  placeholder?: string;
  /** Offer "Use my location". */
  allowLocation?: boolean;
  /** When using location, round to the whole country instead of the city. */
  label?: string;
}

export default function AreaPicker({ value, onChange, placeholder = "Search a city or country", allowLocation = true, label }: Props) {
  const index = useCityIndex();
  const { location, status, request } = useUserLocation({ auto: false });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMemo(() => (index ? index.search(query, 8) : []), [index, query]);
  const [wantLocation, setWantLocation] = useState(false);

  // When the location arrives after the user asked for it, snap it to a city.
  useEffect(() => {
    if (!wantLocation || !location || !index) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot response to the location arriving
    setWantLocation(false);
    const snapped = index.snap(location.lat, location.lon);
    if (snapped) onChange(snapped);
  }, [wantLocation, location, index, onChange]);

  if (value) {
    return (
      <div className="area-chosen">
        {label && <span className="area-chosen__label">{label}</span>}
        <span className="area-chip">
          <span aria-hidden="true">{flag(value.cc)}</span> {value.kind === "city" ? `${value.name}, ${value.country}` : value.country}
          <button type="button" onClick={() => onChange(null)} aria-label="Change place">
            ×
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="area-picker">
      {label && <span className="area-chosen__label">{label}</span>}
      <div className="area-picker__row">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={index ? placeholder : "Loading places…"}
          disabled={!index}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
        />
        {allowLocation && (
          <button
            type="button"
            className="secondary-button small"
            onClick={() => {
              setWantLocation(true);
              request();
            }}
            disabled={status === "locating"}
          >
            {status === "locating" ? "Finding…" : "Use my location"}
          </button>
        )}
      </div>
      {status === "denied" && wantLocation && <p className="hint">Location is off for this site. Please search instead.</p>}
      {open && results.length > 0 && (
        <ul className="area-picker__results" id={listId} role="listbox">
          {results.map((a) => (
            <li key={a.kind === "city" ? `c${a.cityId}` : `k${a.cc}`} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(a);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span aria-hidden="true">{flag(a.cc)}</span> <strong>{a.name}</strong>
                <small>{a.kind === "city" ? a.country : "Whole country"}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the API expects for an area. */
export const areaPayload = (a: Area | null) => (a ? (a.kind === "city" ? { cityId: a.cityId } : { cc: a.cc }) : null);
