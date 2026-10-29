/**
 * Searches every place by name without a database, using the search index the
 * pipeline publishes next to the tiles (pipeline/lib/search-index.mjs).
 *
 * Source: PLACES_SEARCH_URL, else the same folder as PLACES_PMTILES_URL
 * (".../places.pmtiles" -> ".../search.idx"), else the bundled sample
 * (data/tiles/search.idx). Reads the header once, then only the shard a
 * query needs, with HTTP range requests; shards are cached in memory.
 */
import "server-only";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { FetchSource, type Source } from "pmtiles";
import { FileSource } from "./tiles";
import { fold, searchWords, shardKeys, STOP_WORDS } from "@/lib/searchText";

type Row = [id: string, name: string, faith: string, lat: number, lon: number, detail: string, words: string];
interface Header {
  version: number;
  places: number;
  shards: Record<string, [number, number]>;
}

function indexSource(): Source {
  const explicit = process.env.PLACES_SEARCH_URL;
  const tiles = process.env.PLACES_PMTILES_URL;
  const url = explicit ?? (tiles?.endsWith("places.pmtiles") ? tiles.replace(/places\.pmtiles$/, "search.idx") : undefined);
  if (!url) return new FileSource(join(/* turbopackIgnore: true */ process.cwd(), "data/tiles/search.idx"));
  if (url.startsWith("/") || url.startsWith("file:")) return new FileSource(url.replace(/^file:\/\//, ""));
  return new FetchSource(url);
}

let source: Source | null = null;
let header: Promise<{ h: Header; dataStart: number }> | null = null;
const shardCache = new Map<string, Promise<Row[]>>();

async function bytes(offset: number, length: number) {
  source ??= indexSource();
  return Buffer.from((await source.getBytes(offset, length)).data);
}

function loadHeader() {
  header ??= (async () => {
    const head = await bytes(0, 10);
    if (head.toString("ascii", 0, 6) !== "GSIDX1") throw new Error("Not a search index");
    const len = head.readUInt32LE(6);
    const h = JSON.parse(gunzipSync(await bytes(10, len)).toString("utf8")) as Header;
    return { h, dataStart: 10 + len };
  })().catch((err) => {
    header = null; // try again next time
    throw err;
  });
  return header;
}

async function shard(key: string): Promise<Row[]> {
  const { h, dataStart } = await loadHeader();
  const at = h.shards[key];
  if (!at) return [];
  if (!shardCache.has(key)) {
    if (shardCache.size > 60) shardCache.delete(shardCache.keys().next().value!);
    const p = bytes(dataStart + at[0], at[1]).then((b) => JSON.parse(gunzipSync(b).toString("utf8")) as Row[]);
    p.catch(() => shardCache.delete(key));
    shardCache.set(key, p);
  }
  return shardCache.get(key)!;
}

const km = (a: { lat: number; lon: number }, lat: number, lon: number) => {
  const dLat = ((lat - a.lat) * Math.PI) / 180;
  const dLon = ((lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

export interface IndexHit {
  id: string;
  name: string;
  faith: string;
  lat: number;
  lon: number;
  detail: string;
}

/** Places whose words start with every word typed, best first. */
export async function searchIndex(text: string, faith: string | null, near: { lat: number; lon: number } | null, limit = 10): Promise<IndexHit[]> {
  // Common words ("church", "gurdw…") aren't indexed: they rank results, but don't filter them.
  const typed = searchWords(text);
  const isCommon = (w: string) => [...STOP_WORDS].some((s) => s.startsWith(w));
  const words = typed.filter((w) => !isCommon(w));
  if (!words.length) return [];
  const allTyped = fold(text).split(" ").filter((w) => w.length >= 2);
  const { h } = await loadHeader();
  // The longest word narrows things down most.
  const key = [...words].sort((a, b) => b.length - a.length)[0];
  const shardKey = shardKeys(key).find((k) => h.shards[k]);
  if (!shardKey) return [];
  const rows = await shard(shardKey);
  const q = fold(text);
  const scored: { row: Row; score: number }[] = [];
  for (const row of rows) {
    if (faith && row[2] !== faith) continue;
    const rowWords = row[6].split(" ");
    if (!words.every((w) => rowWords.some((rw) => rw.startsWith(w)))) continue;
    let score = words.filter((w) => rowWords.includes(w)).length * 10;
    const name = fold(row[1]);
    const nameWords = name.split(" ");
    score += allTyped.filter((w) => nameWords.some((nw) => nw.startsWith(w))).length * 6;
    if (name === q) score += 40;
    else if (name.startsWith(q)) score += 20;
    score -= name.length / 20;
    if (near) score -= Math.min(km(near, row[3], row[4]), 20000) / 250;
    scored.push({ row, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => ({ id: row[0], name: row[1], faith: row[2], lat: row[3], lon: row[4], detail: row[5] }));
}
