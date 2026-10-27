// Builds public/data/places.geojson with ~500 of the best-known places of
// worship worldwide, pulled live from Wikidata (no API key needed).
//
//   npm run data:fetch
//
// "Best-known" = number of Wikipedia language editions with an article about
// the place (Wikidata "sitelinks"). Each faith gets its own quota so the globe
// isn't 90% cathedrals.
//
// Wikidata asks that automated clients identify themselves, so set
// WIKIMEDIA_CONTACT (an email or URL) in .env.local or your shell.

import { writePlaces } from "./lib/places-output.mjs";

const ENDPOINT = "https://query.wikidata.org/sparql";
const CONTACT = process.env.WIKIMEDIA_CONTACT || "https://github.com/Mitchmoneyy/App-planning";
const USER_AGENT = `GlobalSanctuary/0.1 (${CONTACT})`;

// Each faith: Wikidata building types (matched by English label, so we don't
// hard-code item ids) and how many places to keep.
const FAITHS = [
  { faith: "christianity", quota: 200, types: ["church building", "cathedral", "basilica", "minor basilica", "monastery"] },
  { faith: "islam", quota: 80, types: ["mosque", "congregational mosque", "dargah"] },
  { faith: "judaism", quota: 35, types: ["synagogue"] },
  { faith: "hinduism", quota: 60, types: ["Hindu temple"] },
  { faith: "buddhism", quota: 70, types: ["Buddhist temple", "pagoda", "stupa", "Buddhist monastery"] },
  { faith: "sikhism", quota: 12, types: ["gurdwara"] },
  { faith: "shinto", quota: 20, types: ["Shinto shrine"] },
  { faith: "jainism", quota: 10, types: ["Jain temple"] },
  { faith: "bahai", quota: 8, types: ["Bahá'í House of Worship"] },
  { faith: "chinese", quota: 12, types: ["Taoist temple", "Chinese temple", "Confucian temple"] },
  { faith: "zoroastrianism", quota: 3, types: ["fire temple"] },
];

// "monastery" also matches Buddhist and other monasteries, so for Christianity
// we additionally require a Christian religion (P140) when one is recorded.
const CHRISTIAN_ONLY_TYPES = new Set(["monastery"]);

function buildQuery({ types, quota }) {
  const labels = types.map((t) => `"${t}"@en`).join(" ");
  // Inner query picks the top items by sitelinks; outer query adds details.
  return `
SELECT ?item ?itemLabel ?lat ?lon ?countryLabel ?placeLabel ?religionLabel ?website ?article ?links ?typeLabel ?unesco WHERE {
  {
    SELECT ?item (MAX(?l) AS ?links) (SAMPLE(?t) AS ?type) WHERE {
      VALUES ?typeName { ${labels} }
      ?t rdfs:label ?typeName .
      ?item wdt:P31 ?t ;
            wikibase:sitelinks ?l ;
            wdt:P625 [] .
      FILTER(?l >= 8)
    }
    GROUP BY ?item
    ORDER BY DESC(?links)
    LIMIT ${quota * 2}
  }
  ?item p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] .
  OPTIONAL { ?item wdt:P17 ?country }
  OPTIONAL { ?item wdt:P131 ?place }
  OPTIONAL { ?item wdt:P140 ?religion }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  BIND(EXISTS { ?item wdt:P1435 wd:Q9259 } AS ?unesco)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;
}

async function runQuery(query) {
  const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Wikidata returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).results.bindings;
}

const value = (b, key) => b[key]?.value ?? null;
const qid = (uri) => uri.split("/").pop();
const isQid = (label) => /^Q\d+$/.test(label ?? ""); // unlabelled items come back as "Q123"

async function main() {
  const records = [];
  const used = new Set(); // a building can match several faiths' types; keep the first

  for (const cfg of FAITHS) {
    process.stdout.write(`Querying ${cfg.faith}… `);
    let rows;
    try {
      rows = await runQuery(buildQuery(cfg));
    } catch (err) {
      console.log(`failed (${err.message})`);
      continue;
    }

    // Collapse duplicate rows (an item with 2 countries returns 2 rows).
    const byItem = new Map();
    for (const b of rows) {
      const id = qid(value(b, "item"));
      if (!byItem.has(id)) byItem.set(id, b);
    }

    const picked = [...byItem.entries()]
      .filter(([id, b]) => {
        if (used.has(id) || isQid(value(b, "itemLabel"))) return false;
        if (cfg.faith === "christianity" && CHRISTIAN_ONLY_TYPES.has(value(b, "typeLabel"))) {
          const religion = (value(b, "religionLabel") ?? "").toLowerCase();
          return /christ|catholic|orthodox|anglican|lutheran|protestant|church/.test(religion);
        }
        return true;
      })
      .sort((a, b) => Number(value(b[1], "links")) - Number(value(a[1], "links")))
      .slice(0, cfg.quota);

    for (const [id, b] of picked) {
      used.add(id);
      const article = value(b, "article");
      const place = value(b, "placeLabel");
      const religion = value(b, "religionLabel");
      records.push({
        name: value(b, "itemLabel"),
        faith: cfg.faith,
        tradition: religion && !isQid(religion) ? religion : null,
        city: place && !isQid(place) ? place : null,
        country: value(b, "countryLabel"),
        lat: Number(value(b, "lat")),
        lon: Number(value(b, "lon")),
        heritage: value(b, "unesco") === "true",
        website: value(b, "website"),
        wikipedia: article ? decodeURIComponent(article.split("/wiki/")[1]).replace(/_/g, " ") : null,
        wikidata: id,
      });
    }
    console.log(`${picked.length} places`);

    // Be polite to the public endpoint.
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (records.length < 50) {
    throw new Error(`Only got ${records.length} places from Wikidata — keeping the existing file. Try again later.`);
  }
  writePlaces(records, "wikidata");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
