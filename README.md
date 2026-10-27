# Global Sanctuary

Explore places of worship of every faith on an interactive 3D globe, and (from
Phase 3) pray at any of them from wherever you are.

> **Status: Phase 1 — Globe home screen.** See [Roadmap](#roadmap).

---

## What works now (Phase 1)

- **3D globe home screen** — spin, pinch-zoom, tilt (two-finger drag / right-drag) with momentum.
- **Starts on you** — asks for your location and centers the globe there. If you
  say no, it shows the whole world. The ◎ button returns to your location.
- **Places of worship from all faiths**, colored by faith, grouped into numbered
  clusters when zoomed out. Tap a cluster to zoom into it.
- **Search** by place name, city or country; the globe flies to the result.
- **Filters** — faith, UNESCO World Heritage sites only, distance from you.
- **Place card** on tap, and a **detail page** for every place (faith, tradition,
  location, small map, directions, website and Wikipedia links).
- **Shareable links** — `/place/<id>` for the detail page; `/?place=<id>` opens
  the globe on that place.
- Works on phones and desktops, light and dark mode.

---

## Run it locally

You need **Node.js 20 or newer** ([download](https://nodejs.org/)).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. To try it on your phone, open
`http://<your-computer's-local-IP>:3000` on the same Wi-Fi. Note that browsers only
allow location access on `https://` or `localhost`, so location will be "off"
when testing on a phone this way. Deploying (below) gives you https.

### Production build

```bash
npm run build
```

```bash
npm start
```

### Checks

```bash
npm run lint
```

```bash
npm run typecheck
```

---

## Data

The globe loads `public/data/places.geojson`. Two ways to build it:

| Command | Source | Needs internet | Result |
|---|---|---|---|
| `npm run data:curated` | `data/curated-places.psv` (hand-curated) | No | ~320 famous places, 12 faiths. Coordinates are approximate. |
| `npm run data:fetch` | [Wikidata](https://www.wikidata.org/) | Yes | ~500 best-known places (ranked by how many Wikipedia languages cover them), with Wikidata ids, websites and verified coordinates. |

The committed file was built from the curated list. **Run `npm run data:fetch`
once on your machine** to switch to the Wikidata set. It needs no API key and
prints a count per faith so gaps are easy to spot.

`npm run data:land` rebuilds the small offline world map
(`public/data/countries-110m.geojson`) used when the main map can't load.

Phase 5 replaces this with the full OpenStreetMap dataset (millions of places)
served as pre-built map tiles. The app's clustering and filters are designed
so that is a data swap, not a rewrite.

---

## Settings and API keys

Phase 1 needs **no API keys**. Copy `.env.example` to `.env.local` if you want to
change the optional settings it lists.

Rule for every phase: secret keys live in environment variables used only on the
server. Only values prefixed `NEXT_PUBLIC_` reach the browser, and those are never secrets.

| Phase | Service | Key |
|---|---|---|
| 1–2 | OpenFreeMap (map), Wikidata, Wikipedia, Wikimedia Commons | None |
| 3 | Supabase (database, sign-in), moderation API | Supabase URL + keys, moderation key |
| 4 | Travelpayouts (travel prices), OpenRouteService (driving) | One key each |

---

## Deploy (free tier)

1. Push this repo to GitHub (done).
2. Go to [vercel.com](https://vercel.com/), "Add New Project", and import this repository.
   Keep the defaults and click Deploy.
3. You'll get an `https://…vercel.app` link that works on any phone, with location.

---

## Project structure

```
data/curated-places.psv      Hand-curated starter list (edit to add places)
scripts/                     Data builders (curated, Wikidata, offline land map)
public/data/                 Generated data the app loads
src/app/page.tsx             Home screen (the globe)
src/app/place/[id]/page.tsx  Place detail page (pre-rendered for every place)
src/components/
  Explorer.tsx               Home screen state: location, filters, search, selection
  GlobeMap.tsx               The MapLibre globe, clustering and map controls
  SearchBar.tsx              Search box and results list
  FilterPanel.tsx            Faith / heritage / distance filters
  PlaceCard.tsx              Card shown when a place is tapped
  MiniMap.tsx                Small map on the detail page
src/hooks/useUserLocation.ts Browser location with permission handling
src/lib/                     Types, faith colors, search, geo math, map style
```

**Tech:** Next.js (React + TypeScript), [MapLibre GL JS](https://maplibre.org/)
globe, [OpenFreeMap](https://openfreemap.org/) base map. Supabase arrives in Phase 3.

---

## Credits and licenses

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via OpenFreeMap.
- Place data: [Wikidata](https://www.wikidata.org/) (CC0) and the project's curated list.
- Offline fallback map: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via `world-atlas`.

Map credits appear in the corner of every map, as the licenses require.

---

## Roadmap

1. ✅ **Globe home** — location, clustered markers, search, filters, basic detail page.
2. **Rich detail pages** — history from Wikipedia/Wikidata with attribution, photo
   gallery from Wikimedia Commons with licenses, visitor info (service times, hours).
3. **Digital prayer** — private/public prayers, anonymous posting, prayer wall with
   "I prayed for this", candle lighting with live counts, moderation and reporting.
4. **Accounts, reviews, travel** — optional sign-in, favorites, prayer history,
   reviews and ratings, travel cost estimates with booking links.
5. **Worldwide scale** — full OpenStreetMap dataset as map tiles, server search for
   any city, performance tuning, installable app, privacy pages.
