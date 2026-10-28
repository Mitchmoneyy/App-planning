"use client";

/** Filters: faith, famous landmarks only, and distance from the user. Applied on the map instantly. */
import { useMemo } from "react";
import { FAITHS, type FaithKey } from "@/lib/faiths";
import { faithIconUrl } from "@/lib/map/icons";

export interface Filters {
  /** Empty = all faiths. */
  faiths: FaithKey[];
  /** Only famous landmarks (UNESCO sites, cathedrals, great mosques, temples…). */
  heritageOnly: boolean;
  /** null = any distance. */
  maxDistanceKm: number | null;
}

export const EMPTY_FILTERS: Filters = { faiths: [], heritageOnly: false, maxDistanceKm: null };

export const activeFilterCount = (f: Filters) =>
  f.faiths.length + (f.heritageOnly ? 1 : 0) + (f.maxDistanceKm !== null ? 1 : 0);

const DISTANCES = [5, 25, 100, 500];

interface Props {
  filters: Filters;
  onChange(filters: Filters): void;
  hasLocation: boolean;
  onClose(): void;
}

export default function FilterPanel({ filters, onChange, hasLocation, onClose }: Props) {
  // Rendered only after a click, so the canvas-drawn icons never affect server HTML.
  const icons = useMemo(() => Object.fromEntries(FAITHS.map((f) => [f.key, faithIconUrl(f.key)])), []);
  const toggleFaith = (key: FaithKey) =>
    onChange({
      ...filters,
      faiths: filters.faiths.includes(key) ? filters.faiths.filter((k) => k !== key) : [...filters.faiths, key],
    });

  return (
    <section className="panel filters" aria-label="Filters">
      <header className="filters__header">
        <h2>Filters</h2>
        <button type="button" className="link-button" onClick={() => onChange(EMPTY_FILTERS)} disabled={activeFilterCount(filters) === 0}>
          Clear all
        </button>
      </header>

      <fieldset>
        <legend>Faith</legend>
        <div className="chips">
          {FAITHS.map((f) => {
            const on = filters.faiths.includes(f.key);
            return (
              <button key={f.key} type="button" className={`chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggleFaith(f.key)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
                <img className="chip__icon" src={icons[f.key]} alt="" width={20} height={20} />
                {f.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Landmarks</legend>
        <label className="toggle">
          <input type="checkbox" checked={filters.heritageOnly} onChange={(e) => onChange({ ...filters, heritageOnly: e.target.checked })} />
          Famous landmarks only
        </label>
      </fieldset>

      <fieldset disabled={!hasLocation}>
        <legend>Distance from me</legend>
        {!hasLocation && <p className="hint">Share your location to use this filter.</p>}
        <div className="chips">
          <button type="button" className={`chip${filters.maxDistanceKm === null ? " is-on" : ""}`} onClick={() => onChange({ ...filters, maxDistanceKm: null })}>
            Any
          </button>
          {DISTANCES.map((km) => (
            <button
              key={km}
              type="button"
              className={`chip${filters.maxDistanceKm === km ? " is-on" : ""}`}
              aria-pressed={filters.maxDistanceKm === km}
              onClick={() => onChange({ ...filters, maxDistanceKm: km })}
            >
              Within {km.toLocaleString()} km
            </button>
          ))}
        </div>
      </fieldset>

      <footer className="filters__footer">
        <button type="button" className="primary-button" onClick={onClose}>
          Done
        </button>
      </footer>
    </section>
  );
}
