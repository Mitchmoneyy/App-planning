# Places pipeline

Builds the map of every place of worship on Earth: one vector-tile file
(`places.pmtiles`) the globe streams from, plus rows for the database.

```
Overture Maps places ─┐
OpenStreetMap ────────┼─► normalise faith + denomination ─► de-duplicate ─► pin on building centre ─► tiles + rows
Building outlines ────┤                                                                              (PMTiles, NDJSON)
User suggestions ─────┘
```

It runs monthly in GitHub Actions (`.github/workflows/places-pipeline.yml`) or by hand.

## Current numbers (October 2026 build)

| | |
|---|---|
| Places in Overture's worship categories | 1,664,762 |
| Kept: named, open, confidence ≥ 0.45 | 1,514,854 |
| Merged as duplicates | 33,250 |
| Tiles file (zoom 0–12, all places) | 237 MB |
| Rows for Postgres (gzipped) | 115 MB, about 1.5 GB once indexed |

By faith: Christianity 1.14M, Islam 121k, Hinduism 120k, Buddhism 113k,
Judaism 7.9k, Shinto 7.7k, Sikhism 4.3k, Jainism 1.2k, and smaller numbers of
others. Adding OpenStreetMap (about 1.6M `amenity=place_of_worship` objects,
roughly half not in Overture) should take the total to about **2.5–3 million**.

## Coverage gaps

- **Overture leans Christian and American.** Much of it comes from business
  listings: 449k of its places are in the US. Mosques, temples and shrines in
  Asia and Africa are under-counted until OpenStreetMap is merged in.
- **Small places are missing everywhere**: house churches, village shrines,
  prayer rooms in offices, airports and hospitals, new congregations, and
  places in countries where listing them isn't safe.
- **Denomination is often unknown** (about 60% of churches have none), and a
  few names are mis-categorised by their source (for example a mosque listed
  as a church). The faith normaliser trusts a clear name ("Masjid…",
  "Gurdwara…") over a generic category.
- **Duplicates remain** where sources spell names differently ("Ayasofya" vs
  "Hagia Sophia"). User reports ("It's a duplicate") fix these over time.

User suggestions are how these gaps close: new places, corrections, closures
and duplicates go to the moderation queue at `/admin`, and approved ones are
applied in the next run.

## Run it yourself

Needs Python 3.11+ (`pip install pyarrow fsspec aiohttp shapely`), Node 22,
about 15 GB of RAM for the world build, and 10 GB of free disk.

```bash
# 1. Overture Maps places (about 10 minutes; reads only the worship rows)
python pipeline/overture_places.py --release latest --out pipeline/in/overture

# 2. OpenStreetMap via Overpass (2-5 hours; resumable; please run at most monthly)
node pipeline/osm_overpass.mjs --out pipeline/in/osm

# 3. Building outlines for landmarks from Overture Buildings (optional)
python pipeline/overture_footprints.py pipeline/in/targets.ndjson pipeline/in/footprints.ndjson

# 4. Approved user suggestions (needs DATABASE_URL)
node --env-file=.env.local pipeline/export_suggestions.mjs pipeline/in/suggestions.ndjson

# 5. Merge and build tiles
node --max-old-space-size=12000 pipeline/build.mjs --in pipeline/in --out pipeline/out/world

# 6. Load the database (search across every place, "near me")
node --env-file=.env.local scripts/db-load-places.mjs pipeline/out/world/places.ndjson.gz
```

`--sample` builds the small file that ships in the repo (`data/tiles/places.pmtiles`):
the landmarks plus everything around twelve showcase cities.

### OpenStreetMap from a planet file instead of Overpass

For a fully offline build (a machine with 100 GB of disk), use
[osmium](https://osmcode.org/osmium-tool/):

```bash
osmium tags-filter planet-latest.osm.pbf nwr/amenity=place_of_worship \
  w/building=church,cathedral,chapel,mosque,temple,synagogue,shrine,religious,monastery,gurdwara \
  -o worship.osm.pbf
osmium export worship.osm.pbf -f geojsonseq -o worship.geojsonseq
```

Then convert each feature to the `{ type, id, lon, lat, tags, geometry }` lines
that `osm_overpass.mjs` writes.

## Hosting the tiles

| Option | Cost | Notes |
|---|---|---|
| Cloudflare R2 + `PLACES_PMTILES_URL` | ~$0.01/month storage; no egress fees | Recommended. Free tier covers 10M reads/month |
| GitHub release asset | Free | What the workflow does without R2. Fine to start; slower first byte |
| Bundled sample (`data/tiles`) | Free | 36k places; used when nothing else is set |

The app reads the file with HTTP range requests through `/api/tiles/places/{z}/{x}/{y}`,
so browsers get normal vector tiles and the CDN caches them.

## Licences

- **OpenStreetMap: ODbL 1.0.** Share-alike: a database made from OSM must be
  offered under ODbL too. The tiles and rows here are a "derivative database"
  and should be published under ODbL (the GitHub release does this). Credit:
  "© OpenStreetMap contributors".
- **Overture Maps places: CDLA-Permissive-2.0** (some sources Apache 2.0).
  Credit "Overture Maps Foundation".
- **Overture buildings**: mostly OSM (ODbL), plus Microsoft and Google
  machine-learned outlines (ODbL / CC BY 4.0).
- **Wikidata: CC0. Wikipedia text: CC BY-SA. Commons photos: per photo.**
- **Google Places data can't be used here**: its terms forbid storing it.
