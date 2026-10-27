"use client";

/** Search box with a keyboard-friendly results list (places, cities, countries). */
import { useId, useMemo, useState } from "react";
import { searchPlaces, type SearchResult } from "@/lib/search";
import type { Place } from "@/lib/types";

interface Props {
  places: Place[];
  onPick(result: SearchResult): void;
}

const KIND_LABEL = { place: "Place", city: "City", country: "Country" } as const;

export default function SearchBar({ places, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const results = useMemo(() => searchPlaces(places, query), [places, query]);
  const showList = open && query.trim().length >= 2;

  function pick(result: SearchResult) {
    onPick(result);
    setQuery(result.label);
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur(); // hide phone keyboard
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
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
        placeholder="Search places, cities or countries"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // let clicks on results land first
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
      />

      {showList && (
        <ul className="search__results" id={listId} role="listbox">
          {results.length === 0 && <li className="search__empty">No matches in the sample yet.</li>}
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`search__result${i === active ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="search__kind">{KIND_LABEL[r.kind]}</span>
              <span className="search__label">{r.label}</span>
              <span className="search__detail">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
