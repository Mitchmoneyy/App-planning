#!/usr/bin/env bash
# Every OpenStreetMap place of worship, from Geofabrik's region files.
# Downloads each region (Africa, Asia, Europe, …), keeps only places of
# worship and religious buildings (osmium), and writes pipeline/in/osm/<region>.ndjson.
# One region at a time, deleting each download after use, so ~35 GB of disk is enough.
#
#   bash pipeline/osm_extracts.sh [work dir]        (needs osmium-tool, node, curl)
set -euo pipefail
WORK="${1:-/tmp/osm-work}"
OUT="pipeline/in/osm"
REGIONS="${OSM_REGIONS:-australia-oceania central-america south-america africa russia asia north-america europe antarctica}"
BASE_URL="${OSM_BASE_URL:-https://download.geofabrik.de}"
BUILDINGS="church,cathedral,chapel,mosque,temple,synagogue,shrine,religious,monastery,gurdwara,kingdom_hall"
mkdir -p "$WORK" "$OUT"
for r in $REGIONS; do
  if [ -s "$OUT/$r.ndjson" ]; then echo "$r: already done"; continue; fi
  echo "== $r: downloading"
  curl -fL --retry 5 --retry-delay 20 -sS -o "$WORK/$r.osm.pbf" "$BASE_URL/$r-latest.osm.pbf"
  echo "== $r: $(du -h "$WORK/$r.osm.pbf" | cut -f1), filtering"
  osmium tags-filter "$WORK/$r.osm.pbf" nwr/amenity=place_of_worship "wr/building=$BUILDINGS" -o "$WORK/$r-worship.osm.pbf" --overwrite
  rm -f "$WORK/$r.osm.pbf"
  osmium export "$WORK/$r-worship.osm.pbf" -f geojsonseq -a type,id --geometry-types=point,polygon -o "$WORK/$r.geojsonseq" --overwrite
  node pipeline/osm_from_geojsonseq.mjs "$WORK/$r.geojsonseq" "$OUT/$r.ndjson.tmp"
  mv "$OUT/$r.ndjson.tmp" "$OUT/$r.ndjson"
  rm -f "$WORK/$r-worship.osm.pbf" "$WORK/$r.geojsonseq"
done
rows=$(cat "$OUT"/*.ndjson | wc -l)
# Same report shape as the Overpass downloader, so the nightly check knows it's complete.
printf '{"source":"geofabrik","complete":true,"rows":%s,"tiles":%s,"errors":{},"completedAt":"%s"}\n' "$rows" "$(ls "$OUT"/*.ndjson | wc -l)" "$(date -u +%FT%TZ)" > "$OUT/_report.json"
echo "done: $rows places"
