# Global Sanctuary

Explore places of worship of every faith on an interactive 3D globe, learn
their history, and pray at any of them from wherever you are.

> **Status:** Phases 1–4 are built, plus the installable-app and privacy parts of Phase 5.
> Still to do: the full worldwide dataset (see [Roadmap](#roadmap)).

---

## Features

**Globe (home screen)**
- 3D globe with spin, pinch-zoom, tilt and momentum. It opens on your location, or on the whole world if you decline.
- Places of worship from 12 faiths, colored by faith, grouped into clusters that split apart as you zoom.
- Search by place, city or country, and the globe flies there.
- Filters: faith, UNESCO World Heritage sites only, and distance from you.
- Tap a place for a card with **Visit**, **Pray** and **Save**.

**Place pages**
- Photo gallery from Wikimedia Commons, with author and license on every photo.
- Background and history from Wikipedia (credited), plus key facts from Wikidata: founding date, architectural style, architect, heritage status.
- Visitor information: map, address, website, directions.
- **Plan a visit**: estimated round-trip flight or driving cost and lodging per night from your location, labelled as estimates, with links to flight and hotel search.
- **Reviews**: star ratings and written reviews from signed-in users (moderated), plus links to Google Maps and Tripadvisor reviews.
- Live counts of candles lit and prayers offered.

**Digital prayer** (`/place/<id>/pray`)
- Light a virtual candle, with a gentle flame animation and a glow of other candles lit today.
- Offer a prayer that is **private** (only you see it, encrypted in the database) or **shared** on the place's prayer wall, anonymously or with a name.
- Others can tap **"I prayed for this"**. Each person counts once.
- **Moderation**: built-in rules block links and contact details, and hold profanity or possible self-harm for review. When an Anthropic API key is set, Claude also checks every shared prayer and review. People can report prayers, and three reports hide one until a moderator looks.
- If a prayer suggests the author may be in danger, they're shown helpline information right away.

**Accounts** (optional)
- Everything works without an account. Saved places, prayers and candles are remembered on the device.
- Create an account (email + password) to keep them across devices and to write reviews. Anything you did before signing up moves to the account.
- **My sanctuary** (`/me`): saved places, prayer history with status, and delete any prayer or the whole account.
- **Moderation queue** (`/admin`) for accounts listed in `ADMIN_EMAILS`.

**Also:** installable on phones (Add to Home Screen), light/dark mode, About and Privacy pages.

---

## Run it locally

Needs **Node.js 20+**.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. With no settings, the app uses a built-in development database saved in `.data/db.json`.

### Checks

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

To also run the database tests against a real Postgres (this **wipes** that database):

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/test_db npm test
```

---

## Go live (free tiers)

1. **Database: Supabase** (free). Create a project at [supabase.com](https://supabase.com). In *Project Settings → Database → Connection string*, copy the **Transaction pooler** URL.
2. **Create the tables** from your computer:
   ```bash
   DATABASE_URL="<your pooler url>" npm run db:migrate
   ```
3. **Hosting: Vercel.** Import this repository at [vercel.com](https://vercel.com), and add these environment variables before deploying:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase pooler URL |
   | `PRAYER_ENCRYPTION_KEY` | output of `openssl rand -base64 32`. Keep a copy somewhere safe. |
   | `ADMIN_EMAILS` | your email (then create an account with it to moderate) |
   | `ANTHROPIC_API_KEY` | optional, turns on AI moderation |
   | `WIKIMEDIA_CONTACT` | your email |

4. Deploy, and open the link on your phone.

Without `DATABASE_URL` on Vercel the app still runs, but in **demo mode**: data is kept only in memory and resets. Every page says so.

### Costs

| Service | Cost |
|---|---|
| Vercel, Supabase, OpenFreeMap, Wikipedia/Wikidata/Commons | Free tiers to start |
| AI moderation (Claude) | Per prayer checked, a fraction of a cent. Only shared prayers and reviews are checked, never private prayers. Set `MODERATION_MODEL` to use a cheaper Claude model. |

---

## How it's built

- **Next.js 16** (React, TypeScript). Place pages are pre-rendered; live data comes from API routes in `src/app/api`.
- **MapLibre GL** globe with a free OpenFreeMap base map, and a built-in offline fallback map.
- **Storage** (`src/server/db`): one interface with two back ends. **Postgres** (`DATABASE_URL`, schema in `db/schema.sql`) for production, and a file-backed store for development. Both pass the same tests.
- **Identity**: an anonymous device cookie for everyone, plus an optional session cookie after sign-in. Passwords use scrypt; only hashes of session tokens are stored.
- **Security**: all writes check the request comes from this site, every input is validated and length-limited, actions are rate-limited, and private prayers use AES-256-GCM.
- **Wikimedia data** (`src/server/wikimedia.ts`) is cached on the server and at the CDN for a day per place.

```
src/app/                    Pages and API routes
src/app/api/                places/[id]/{info,stats,candles,prayers,reviews}, prayers/[id]/…, me/…, auth/…, admin/…
src/components/             UI (globe, place page sections, prayer space, account pages)
src/server/                 Server-only code: database, moderation, security, Wikimedia
src/lib/                    Shared code: types, search, travel estimates, geo math
db/schema.sql               Postgres schema
scripts/                    Data builders and the database migration
tests/                      Unit and storage tests (Vitest)
```

---

## Data

The globe loads `public/data/places.geojson`.

| Command | What it does |
|---|---|
| `npm run data:curated` | Builds ~320 famous places across 12 faiths from `data/curated-places.psv` (offline; coordinates approximate). |
| `npm run data:fetch` | Builds ~500 best-known places from Wikidata, with exact coordinates and Wikidata ids. **Run once on your machine.** |
| `npm run data:land` | Rebuilds the offline fallback world map. |

---

## Credits and licenses

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via OpenFreeMap.
- Text from [Wikipedia](https://en.wikipedia.org/) (CC BY-SA 4.0), credited on each page with a link to the article.
- Facts from [Wikidata](https://www.wikidata.org/) (CC0).
- Photos from [Wikimedia Commons](https://commons.wikimedia.org/), each shown with its author and license.
- Offline fallback map: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

---

## Roadmap

1. ✅ **Globe home**: location, clustered markers, search, filters.
2. ✅ **Rich place pages**: Wikipedia history, Commons photos, Wikidata facts, visitor info.
3. ✅ **Digital prayer**: candles with live counts, private/shared prayers, prayer wall, "I prayed for this", moderation and reporting.
4. ✅ **Accounts, reviews, travel**: optional accounts, saved places, prayer history, reviews, travel cost estimates.
5. **Worldwide scale and polish**: ✅ installable app, ✅ privacy & about pages.
   Still to do:
   - Full OpenStreetMap dataset (millions of places) served as map tiles, with server search for any city.
   - Service times and opening hours from OpenStreetMap.
   - Password reset by email (needs an email service such as Resend).
   - Live flight prices (e.g. Travelpayouts) in place of the estimate model.
   - Legal review of the privacy page before public launch.
