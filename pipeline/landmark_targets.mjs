// Writes the curated landmarks as footprint targets ({ id, lon, lat } per line)
// for pipeline/overture_footprints.py.
//   node pipeline/landmark_targets.mjs > pipeline/in/targets.ndjson
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("public/data/places.geojson", "utf8"));
for (const f of data.features) {
  const [lon, lat] = f.geometry.coordinates;
  console.log(JSON.stringify({ id: `c:${f.properties.id}`, lon, lat }));
}
