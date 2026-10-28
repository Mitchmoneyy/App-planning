# Global Sanctuary

A living globe of the world's places of worship. Spin it, tap a light, and *arrive*: look around,
learn the history, light a candle and pray there. Send prayers and blessings to people anywhere,
of any faith, and watch them travel across the globe as arcs of light.

**Website** (Next.js, desktop layout) · **iOS & Android app** (Expo, shares the website) · **Postgres** backend.

---

## What's built

| Phase | Status | What you get |
|---|---|---|
| 1 · Globe home | ✅ | 3D globe (spin, zoom, tilt, momentum), opens on your location, "return to my location", clustered markers, search with fly-to, filters (faith, UNESCO landmarks, distance) |
| 2 · Light / dark | ✅ | Toggle + follows the device setting. Day: NASA Blue Marble. Night: NASA city lights, atmosphere glow, starfield, candle-like glowing markers. Smooth cross-fade |
| 3 · Arriving at a place | ✅ | Cinematic fly-in from space, then the best available view: Street View → 360° panorama (Commons / Mapillary) → photo slideshow (Ken Burns) → 3D map. Live local time & weather, optional ambient sound, info panels (About & history, Photos, Visit & travel costs, Reviews), "Back to globe" |
| 4 · Prayer at places | ✅ | Prayer tab inside the view: light a candle, private or shared prayers, prayer wall, "I prayed for this", anonymous posting, moderation + report |
| 5 · Pray for people in places | ✅ | Send a prayer/blessing to any city or country (blessings from many traditions, or your own words), prayer requests, animated arcs + glow on the globe, "Prayers for your area", notifications (in-app, email, web push, phone push), block & report, optional faith, city-level privacy |
| 6 · Accounts, reviews, travel, weather | ✅ | Optional accounts, saved places, prayer history (sent & received), reviews, travel estimates, weather & local time |
| 7 · Phone app | ✅ (shell) | Expo app for iOS/Android around the website, with native push notifications, location and back-button handling |
| 8 · Worldwide scale & polish | ⏳ | See [What's next](#whats-next) |

---

## Architecture (and why)

### One codebase for web and phones

```
app-planning/
├── src/        Next.js website + API (everything users see, all business logic)
└── mobile/     Expo app (iOS/Android): native shell that shows the website
```

**Choice: the phone app hosts the website in a native shell**, adding the things only native code can do
(push notifications, location permission, back button, opening links in the browser).

- **Why:** the heart of the product, a WebGL globe with custom shaders, arcs, glow and immersive
  360° views, would otherwise need to be built twice. React Native has no equivalent of globe.gl/three.js
  that reaches the same quality, so a "native" globe would look worse *and* double the work.
  With the shell, every feature ships on web, iOS and Android at once.
- **Trade-off:** scrolling and animations feel slightly less native than a fully native app, and
  the desktop layout needs a phone layout (planned in the next phase). If later you want fully native
  screens (e.g. a native prayer list), the API and shared types in `src/lib` are already split out,
  so screens can be moved to React Native one at a time.

### Globe library: globe.gl (three.js)

| | Day/night textures | Glowing markers | Animated arcs | Fly-in | Phones | Verdict |
|---|---|---|---|---|---|---|
| **globe.gl / three.js** | ✅ custom shader | ✅ | ✅ built in | ✅ | ✅ light, WebGL | **Chosen** |
| CesiumJS | ✅ | ✅ | ✅ | ✅ best | ⚠️ heavy (~3 MB+), slow on mid-range phones; Cesium ion token for its imagery | Overkill |
| Mapbox / MapLibre globe | ⚠️ raster only | ✅ | ⚠️ flat lines only | ✅ | ✅ | No raised light arcs |

The street-level part of "arriving" is handled by the immersive view (Street View, 360°, map), not by the
globe, so the globe can focus on looking beautiful from space.

**Scale:** markers are clustered with Supercluster for the current zoom *and* only for the visible side of
the Earth, so only a few hundred markers exist at once, whether the dataset has 300 or 1,000,000 places.

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
| Places of worship | Wikidata (sample), OpenStreetMap (full, next phase) | Free | — | ODbL / CC0; credited on every map |
| History, facts | Wikipedia + Wikidata | Free | — | CC BY-SA text credited with link |
| Photos | Wikimedia Commons | Free | — | Author + license shown for every photo |
| 360° panoramas | Commons + **Mapillary** | Free | `MAPILLARY_ACCESS_TOKEN` (free client token) | CC BY-SA, credited |
| Street View | Google Maps **Embed API** + Street View **metadata** | Free (Google doesn't charge for these two; confirm in your Google Cloud console) | `GOOGLE_MAPS_API_KEY` (server) + `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (restrict to your domain) | Optional. Without keys the app uses 360°/photos/map |
| Reviews | **Our own reviews** + links to Google Maps / Tripadvisor | Free | — | Google Places reviews can't be stored, show max 5 and can't sit on a non-Google map; Tripadvisor's API needs approval. Linking out avoids both |
| Travel costs | Our estimate model + booking links | Free (links can earn affiliate commission) | optional `NEXT_PUBLIC_BOOKING_AFFILIATE_ID` | Amadeus self-service is being shut down; Kiwi Tequila is closed to new sign-ups; Skyscanner needs partner approval. Travelpayouts is the best live-price option later |
| Globe imagery | NASA Blue Marble + Earth at Night | Free | — | Public domain (credit "NASA") |
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

**All keys are optional.** The app runs with none: built-in development database, built-in moderation rules,
and the 360°/photo/map views. Secret keys only ever live on the server; `NEXT_PUBLIC_` values are designed to be public.

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
   - optional: `ANTHROPIC_API_KEY`, push/email/Street View/Mapillary keys
3. Deploy.

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
src/app/(globe)/            Globe screens (one globe stays mounted): home, place, world, area
src/app/api/                API routes (places, prayers, world prayers, requests, me, auth, admin, blocks)
src/components/globe/       Globe (globe.gl + shaders + clustering) and its shell
src/components/immersive/   Arrival view: panorama viewer, Ken Burns, 3D map, panels, sound, live chips
src/components/world/       Pray for the world: composer, requests, area view
src/components/me/          My sanctuary: settings, history, blocked list
src/server/                 Server-only: database, moderation, notifications, Wikimedia, weather, Street View
src/lib/                    Shared logic & types (cities, blessings, travel, search, time zones, ambient sound)
db/schema.sql               Postgres schema (npm run db:migrate)
public/textures/            NASA globe textures (see CREDITS.md)
public/data/                Places, cities, offline map
mobile/                     Expo iOS/Android app
tests/                      64 tests (logic, moderation, storage on both back ends, Wikimedia parsing)
```

---

## What's next

1. **Worldwide places dataset**: process the OpenStreetMap planet file (`amenity=place_of_worship`) into
   map tiles/sharded files, plus server-side search for any city. The globe's clustering is already
   built for this, so it's a data change, not a rewrite.
2. **Phone layouts**: responsive versions of the panels for small screens (the layout uses flexible units to make this straightforward).
3. Service times and opening hours (from OpenStreetMap), password reset by email, live flight prices,
   and an approved external reviews source.
4. Legal review of the Privacy page before public launch, since prayers can reveal religious belief.
