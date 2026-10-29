# Global Sanctuary

A living globe of the world's places of worship. Zoom from space to any street, find any of 1.5 million
places of every faith, and *arrive*: look around, learn the history, and pray there in the way of its tradition. Send prayers and blessings to people anywhere,
of any faith, and watch them travel across the globe as arcs of light.

**Website** (Next.js, desktop layout) · **iOS & Android app** (Expo, shares the website) · **Postgres** backend.

---

## What's built

| Area | Status | What you get |
|---|---|---|
| Globe: space to street | ✅ | One continuous map from orbit to a single building: satellite imagery that sharpens as you zoom, 3D buildings and terrain (Mapbox), tilt and rotate, zoom buttons, compass and scale bar, crisp vector labels that never overlap |
| Every place of worship | ✅ | **1.5 million places** worldwide (Overture Maps; OpenStreetMap joins on the next pipeline run) as vector tiles: clustered from space, a distinct icon per faith at street level, names when zoomed in, famous landmarks visible from orbit |
| Precise location | ✅ | Pins on the building's centre; glowing gold outline and 3D massing of the building you visit; pulsing beacon during the fly-in; full address, coordinates (copy), Google and Apple Maps directions |
| Search & filters | ✅ | Places, cities, countries and faiths ("mosques in Istanbul"); filters by faith, landmarks and distance, applied instantly on the map |
| Light / dark | ✅ | Day satellite; at night NASA Black Marble city lights from space, darkened imagery near the ground, atmosphere and stars, glowing markers; smooth cross-fade |
| Arriving at a place | ✅ | Cinematic dive from space, then the best view: Street View → 360° (Mapillary/Commons) → **Google photorealistic 3D** → photo slideshow → aerial (the live map at the glowing building). Local time, weather, optional ambient sound, history, photos, visitor etiquette, reviews, travel |
| Prayer at places | ✅ | Faith-appropriate gestures (candle, diya, flowers, incense, butter lamp, ema, prayer note, dua, Ardas, simple prayer), live counts, private or shared prayers, prayer wall, "I prayed for this", anonymous posting, moderation |
| Pray for people in places | ✅ | Prayers and blessings to any city or country, requests, travelling arcs, "Prayers for your area", notifications, block & report, city-level privacy |
| Accounts & community | ✅ | Optional accounts, saved places, history, reviews; **suggest a new place, a correction, a closure or a duplicate** → moderation queue → applied in the next data run |
| Data pipeline | ✅ | Monthly GitHub Action: Overture + OpenStreetMap + suggestions → normalise faiths/denominations → de-duplicate → tiles + database rows. See [pipeline/README.md](pipeline/README.md) |
| Phone app | ✅ (shell) | Expo app for iOS/Android around the website (the globe runs inside it), with native push, location and back button |
| Phone layouts | ⏳ | Desktop layout only for now |

---

## Architecture (and why)

### Map engine: Mapbox GL JS (with a free MapLibre fallback)

The top priority is a crisp, smooth zoom from space to the street, so the globe is a real map engine
rather than a 3D model of the Earth.

| | Space → street sharpness | 3D buildings | Night lights, glow, arcs | Millions of markers | Phones | Cost |
|---|---|---|---|---|---|---|
| **Mapbox GL JS v3** ✅ | Excellent: Mapbox Satellite to ~10 cm in cities, streams progressively | ✅ + terrain | ✅ fog, stars, our layers | ✅ vector tiles | Native SDKs, same style | 50k loads/month free |
| MapLibre GL (free fallback) | Good with MapTiler; ~10 m with free imagery | Boxes only | ✅ | ✅ | Native SDKs | Free / flat-rate |
| CesiumJS + Google 3D | Best close-up | Photoreal | Possible | Weak beyond ~100k points | Heavy | Per 3D session |
| globe.gl (previous version) | Blurry below country level | ✗ | ✅ | Limited | Web only | Free |

**Choice:** the globe uses **Mapbox GL JS** when `NEXT_PUBLIC_MAPBOX_TOKEN` is set, otherwise
**MapLibre GL** with free imagery (or MapTiler with `NEXT_PUBLIC_MAPTILER_KEY`). Both engines draw the
*same* style (`src/lib/map/style.ts`), so switching is a setting, not a rewrite: useful while the
budget is undecided. **Google Photorealistic 3D Tiles** are used only inside a place's "3D" view
(CesiumJS, loaded on demand), never mixed into the Mapbox map, as Google's terms require.

Quality and performance settings:
- Retina rendering (device pixel ratio up to 2), antialiasing, 180 ms tile fade.
- Mapbox preloads the destination's tiles before each fly-in (`preloadOnly`), so nothing pops in on arrival.
- Signed-distance-field text and icons with collision detection, so labels never overlap.
- Animations touch the map only while something moves, so it idles at 0% GPU otherwise.
- Places come as vector tiles, filtered on the GPU, so a million points cost the same as a thousand.

**Trade-offs:** Retina tiles and preloading mean more tile requests, so somewhat higher cost and battery
use. The free fallback isn't street-level sharp (10 m Sentinel-2 imagery), but every feature works.

### Web and phones

```
app-planning/
├── src/        Next.js website + API (all screens and business logic)
├── pipeline/   Data pipeline: every place of worship → vector tiles
└── mobile/     Expo app (iOS/Android): native shell around the website
```

The phone app hosts the website in a native shell (push, location, back button). Mapbox GL JS runs well
in the phone's web view, so the globe works on phones today. **Next step for phones:** move the globe to
Mapbox's native SDK (`@rnmapbox/maps`) for native 60 fps. The style JSON and layers are shared, so it's
a port of one screen, not a rewrite. Google 3D would stay in a web view on phones (it's the heaviest view).

### Backend: Postgres (Supabase recommended)

Plain Postgres through our own API routes, rather than Firebase:
- prayers, requests, notifications and blocks are relational; Postgres handles them cleanly,
- moderation, privacy rules and rate limits live on our server, never trusting the browser,
- "live" counts and arcs refresh every 15–30 s, which feels live without a realtime service.
  Supabase Realtime can be added later for instant updates.

---

## Data sources, costs and keys

| Need | Source | Cost | Key | Notes |
|---|---|---|---|---|
| Places of worship | Overture Maps (1.5M) + OpenStreetMap + Wikidata, via `pipeline/` | Free | — | CDLA-Permissive / ODbL (share-alike: publish the merged data under ODbL) / CC0 |
| Places tiles hosting | Cloudflare R2 (or a GitHub release) | ~$0/month (R2: no egress fees, 10M reads free) | `PLACES_PMTILES_URL` | 240 MB file; a 33k-place sample ships in the repo |
| Places search (all 1.5M) | A search index the pipeline publishes next to the tiles (`search.idx`), read in small pieces; or Supabase Postgres (trigram index) if you prefer | Free | none (`DATABASE_URL` optional) | Works with no database: the server reads only the piece of the index a search needs |
| Globe imagery & map | **Mapbox** (satellite, streets, 3D buildings, terrain) | 50,000 loads/month free, then ~$5 per 1,000 (volume discounts) | `NEXT_PUBLIC_MAPBOX_TOKEN` (public, URL-restricted) | Without it: free NASA + Sentinel-2 imagery and OpenFreeMap |
| Photoreal 3D close-ups | Google Map Tiles API (Photorealistic 3D Tiles) | Billed per 3D session after a free monthly allowance (check Google's current pricing) | `NEXT_PUBLIC_GOOGLE_MAPS_3D_KEY` (browser key, Map Tiles API only, URL-restricted) | Only charged when someone opens "3D"; coverage ~2,500 cities |
| Night lights | NASA Black Marble (GIBS) | Free | — | Public domain |
| History, facts | Wikipedia + Wikidata | Free | — | CC BY-SA text credited with link |
| Photos | Wikimedia Commons | Free | — | Author + license shown for every photo |
| 360° panoramas | Commons + **Mapillary** | Free | `MAPILLARY_ACCESS_TOKEN` (free client token) | CC BY-SA, credited |
| Street View | Google Maps **Embed API** + Street View **metadata** | Free (Google doesn't charge for these two; confirm in your Google Cloud console) | `GOOGLE_MAPS_API_KEY` (server) + `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (restrict to your domain) | Optional. Without keys the app uses 360°/photos/map |
| Reviews | **Our own reviews** + links to Google Maps / Tripadvisor | Free | — | Google Places reviews can't be stored, show max 5 and can't sit on a non-Google map; Tripadvisor's API needs approval. Linking out avoids both |
| Travel costs | Our estimate model + booking links | Free (links can earn affiliate commission) | optional `NEXT_PUBLIC_BOOKING_AFFILIATE_ID` | Amadeus self-service is being shut down; Kiwi Tequila is closed to new sign-ups; Skyscanner needs partner approval. Travelpayouts is the best live-price option later |
| Offline base imagery | NASA Blue Marble + Black Marble (bundled tiles) | Free | — | Public domain |
| Cities (rounding locations) | GeoNames (15,000+ people) | Free | — | CC BY 4.0, bundled offline |
| Weather | MET Norway Locationforecast | Free, commercial use allowed | — | Credit MET Norway; cached 30 min. (Open-Meteo's free tier is non-commercial) |
| Local time | Offline time-zone lookup | Free | — | |
| Moderation | Built-in rules + Claude | Fractions of a cent per shared prayer | `ANTHROPIC_API_KEY` | Private prayers are never sent |
| Email | Resend | Free tier for low volume | `RESEND_API_KEY`, `EMAIL_FROM` | Max one email/hour per person |
| Web push | Standard Web Push (VAPID) | Free | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Generate with `npx web-push generate-vapid-keys` |
| Phone push | Expo push service | Free | EAS project id in `mobile/app.json` | |
| Database | Supabase (Postgres) | Free tier | `DATABASE_URL` | |
| Hosting | Vercel | Free tier | — | |
| App stores | Apple / Google | $99/year Apple, $25 once Google | — | Builds via Expo EAS (free tier) |

**What it costs as you grow** (rough): at 10,000 visitors a month everything fits in free tiers. At
100,000 monthly map loads, Mapbox is about $250/month (or switch to MapTiler's flat plans with one
setting). Google 3D is pay-per-use. Supabase Pro ($25) and Vercel Pro ($20) once traffic is steady.

**All keys are optional.** The app runs with none: built-in development database, built-in moderation rules,
free imagery and the sample places. Secret keys only ever live on the server; `NEXT_PUBLIC_` values are designed to be public.

---

## Run it

Needs **Node.js 20+**.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000 (a desktop/laptop browser; phone layouts come next).

Checks:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

Run the database tests against a real Postgres too (this **wipes** that database):

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/test_db npm test
```

---

## Go live

1. **Database:** create a free [Supabase](https://supabase.com) project → *Project Settings → Database → Connection string* → copy the **Transaction pooler** URL. Then create the tables:
   ```bash
   DATABASE_URL="<your pooler url>" npm run db:migrate
   ```
2. **Vercel:** import this repository at [vercel.com](https://vercel.com) and add environment variables (see `.env.example`). The important ones:
   - `DATABASE_URL`
   - `PRAYER_ENCRYPTION_KEY`: output of `openssl rand -base64 32`. Keep a copy somewhere safe.
   - `ADMIN_EMAILS`: your email (then sign up with it to moderate at `/admin`)
   - `NEXT_PUBLIC_SITE_URL`: your site's address (used in emails and notifications)
   - `NEXT_PUBLIC_MAPBOX_TOKEN`: a public token from [account.mapbox.com](https://account.mapbox.com/access-tokens) with URL restrictions set to your domain
   - `PLACES_PMTILES_URL`: the world tiles (see [pipeline/README.md](pipeline/README.md#hosting-the-tiles))
   - optional: `NEXT_PUBLIC_GOOGLE_MAPS_3D_KEY`, `ANTHROPIC_API_KEY`, push/email/Street View/Mapillary keys
3. Deploy.
4. Optional, for search across every place: load the places table (`npm run db:places`, see the pipeline README), and let the GitHub Action keep it fresh.
5. The places tiles: set `PLACES_PMTILES_URL` to `https://github.com/<you>/<repo>/releases/latest/download/places.pmtiles`. The "Places pipeline" GitHub Action builds and publishes them on its own (nightly until OpenStreetMap is fully downloaded, then monthly).

### Phone app

```bash
cd mobile
```

```bash
npm install
```

1. In `mobile/app.json`, set `expo.extra.siteUrl` to your deployed site (e.g. `https://your-app.vercel.app`).
2. Try it on your phone with the free **Expo Go** app: run `npx expo start` and scan the QR code.
3. For the stores and push notifications: create a free [Expo](https://expo.dev) account, then `npx eas-cli init` (adds the project id push needs), `npx eas-cli build --platform all`, and `npx eas-cli submit`.

---

## Privacy & safety by design

- **No exact locations, ever.** Locations are rounded *in the browser* to a city (the main city of a metro
  area) or a country before being sent. The server only accepts a city id or country code from its own list.
- Senders choose to show their city, their country, or nothing; posting can always be anonymous.
- Faith is optional and private unless the person chooses to show it.
- Private prayers are encrypted at rest (AES-256-GCM).
- All shared text is moderated: links, contact details, profanity, attacks on other faiths, attempts to
  convert, and possible self-harm (the author is shown helpline information). Plus reporting
  (3 reports hide an item) and blocking (hides that person's content and stops their notifications).
- Accounts can be deleted with all their data. Notifications are opt-in and rate-limited.

---

## Project structure

```
src/app/(globe)/            Globe screens (one globe stays mounted): home, place, world, area, suggest
src/app/api/                API routes (tiles, search, places, prayers, world, requests, suggestions, me, auth, admin)
src/components/globe/       The globe (Mapbox / MapLibre) and its shell
src/lib/map/                Shared map style, faith icons
src/components/immersive/   Arrival view: Street View, 360°, Google 3D, Ken Burns, panels, sound, live chips
src/components/Offering.tsx Faith-appropriate devotional gestures (src/lib/gestures.ts)
src/components/world/       Pray for the world: composer, requests, area view
src/components/me/          My sanctuary: settings, history, blocked list
src/server/                 Server-only: database, moderation, notifications, Wikimedia, weather, Street View
src/lib/                    Shared logic & types (cities, blessings, travel, search, time zones, ambient sound)
db/schema.sql               Postgres schema (npm run db:migrate); db/places.sql for the places table
pipeline/                   Places pipeline (Overture, OpenStreetMap, footprints, tiles)
data/tiles/                 Sample places tiles (33k places)
public/tiles, public/fonts  Offline NASA imagery tiles and map label fonts
public/data/                Landmarks, cities, country shapes
mobile/                     Expo iOS/Android app
tests/                      Tests (logic, moderation, gestures, faith normalisation, tiles, storage on both back ends)
```

---

## What's next

1. **Run the pipeline with OpenStreetMap** (GitHub Actions → "Places pipeline" → Run): adds roughly a
   million more places, mostly mosques, temples and shrines outside the Americas, plus building outlines
   for most of them.
2. **Native globe on phones** with `@rnmapbox/maps`, then phone layouts for the panels.
3. Service times (from OpenStreetMap `service_times`), licensed ambient recordings per tradition,
   password reset by email, live flight prices.
4. Community review of the gestures and etiquette notes by people from each tradition, and a legal review
   of the Privacy page before launch, since prayers can reveal religious belief.
