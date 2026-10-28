"use client";

/**
 * Search box: places of worship, cities and countries, with faith words
 * understood ("mosques in Istanbul"). Results blend server search with
 * matching places already loaded on the map around you.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { PlaceSummary } from "./globe/GlobeMap";
import type { SearchHit } from "@/lib/apiTypes";
import { api } from "@/lib/client";
import { faithColor, faithLabel, type FaithKey } from "@/lib/faiths";
import type { LngLat } from "@/lib/types";

interface Props {
  /** Places loaded on the map right now (for instant nearby matches). */
  nearby(): PlaceSummary[];
  near: LngLat | null;
  onPick(hit: SearchHit, faith: FaithKey | null): void;
}

const KIND_LABEL = { place: "Place", city: "City", country: "Country" } as const;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SearchBar({ nearby, near, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<{ q: string; hits: SearchHit[]; faith: FaithKey | null }>({ q: "", hits: [], faith: null });
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const nearRef = useRef(near);
  const nearbyRef = useRef(nearby);
  useEffect(() => {
    nearRef.current = near;
    nearbyRef.current = nearby;
  });

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      const n = nearRef.current;
      const params = new URLSearchParams({ q });
      if (n) {
        params.set("lat", n.lat.toFixed(2));
        params.set("lon", n.lon.toFixed(2));
      }
      const server = await api<{ hits: SearchHit[]; faith: FaithKey | null }>(`/api/search?${params}`).catch(() => ({ hits: [], faith: null }));
      if (cancelled) return;
      // Places on the map around you that match, first.
      const words = fold(q).split(/\s+/).filter((w) => w.length > 1);
      const local: SearchHit[] = nearbyRef
        .current()
        .filter((p) => (!server.faith || p.faith === server.faith) && words.some((w) => fold(p.name).includes(w)))
        .slice(0, 4)
        .map((p) => ({ kind: "place", id: p.id, name: p.name, faith: p.faith as FaithKey, lat: p.lat, lon: p.lon, detail: "On the map", landmark: p.landmark }));
      const ids = new Set(local.map((h) => (h.kind === "place" ? h.id : "")));
      setResults({ q, faith: server.faith, hits: [...local, ...server.hits.filter((h) => h.kind !== "place" || !ids.has(h.id))].slice(0, 12) });
      setLoading(false);
      setActive(0);
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  const hits = results.q === q ? results.hits : [];
  const showList = open && q.length >= 2;

  function pick(hit: SearchHit) {
    onPick(hit, results.faith);
    setQuery(hit.name);
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search">
      <svg className="search__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        className="search__input"
        type="search"
        placeholder="Search a place, city, country or faith"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
      />

      {showList && (
        <ul className="search__results" id={listId} role="listbox">
          {results.faith && results.q === q && (
            <li className="search__note" role="presentation">
              Showing {faithLabel(results.faith)} places
            </li>
          )}
          {hits.length === 0 && <li className="search__empty">{loading || results.q !== q ? "Searching…" : "No matches. Try a city name, or zoom the map to an area."}</li>}
          {hits.map((r, i) => (
            <li
              key={r.kind === "place" ? r.id : `${r.kind}:${r.cc}:${r.name}:${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`search__result${i === active ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="search__kind">
                {r.kind === "place" && <span className="search__dot" style={{ background: faithColor(r.faith) }} aria-hidden="true" />}
                {r.kind === "place" && r.landmark ? "Landmark" : KIND_LABEL[r.kind]}
              </span>
              <span className="search__label">{r.name}</span>
              <span className="search__detail">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
