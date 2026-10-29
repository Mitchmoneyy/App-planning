/**
 * Reads the places vector tiles (one PMTiles file built by pipeline/build.mjs).
 *
 * - PLACES_PMTILES_URL set: the full-world file in object storage (Cloudflare
 *   R2, S3, …), read with HTTP range requests, so nothing big is deployed.
 * - PLACES_PMTILES_URL=/abs/path.pmtiles: a local file (development).
 * - otherwise: the sample file bundled in data/tiles/places.pmtiles.
 *
 * The same file is the lookup for place pages: a place id carries its
 * street-level tile, so a place can be found without a database.
 */
import "server-only";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { FetchSource, PMTiles, type RangeResponse, type Source } from "pmtiles";

export const PLACE_TILE_ZOOM = 12;

export class FileSource implements Source {
  constructor(private path: string) {}
  getKey() {
    return this.path;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const fh = await open(this.path, "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) as ArrayBuffer };
    } finally {
      await fh.close();
    }
  }
}

let archive: PMTiles | null = null;
function getArchive() {
  if (!archive) {
    const url = process.env.PLACES_PMTILES_URL;
    const local = !url || url.startsWith("/") || url.startsWith("file:");
    const path = !url ? join(/* turbopackIgnore: true */ process.cwd(), "data/tiles/places.pmtiles") : url.replace(/^file:\/\//, "");
    archive = new PMTiles(local ? new FileSource(path) : new FetchSource(url));
  }
  return archive;
}

/** Decompressed vector tile bytes, or null for an empty tile. */
export async function getPlacesTile(z: number, x: number, y: number): Promise<Uint8Array | null> {
  const tile = await getArchive().getZxy(z, x, y);
  return tile?.data ? new Uint8Array(tile.data) : null;
}

export async function getPlacesMetadata() {
  return (await getArchive().getMetadata()) as { summary?: { total: number; byFaith: Record<string, number> } } | null;
}

export interface TilePlace {
  id: string;
  lon: number;
  lat: number;
  props: Record<string, string | number | boolean>;
  footprint: GeoJSON.Geometry | null;
}

/** "2k1-1a3-9f3c2b" -> the street-level tile it lives in. */
export function tileOfId(id: string): { x: number; y: number } | null {
  const m = /^([0-9a-z]{1,4})-([0-9a-z]{1,4})-[0-9a-z]+$/.exec(id);
  if (!m) return null;
  const x = parseInt(m[1], 36);
  const y = parseInt(m[2], 36);
  const n = 2 ** PLACE_TILE_ZOOM;
  return x < n && y < n ? { x, y } : null;
}

/** Find a place (and its building outline) in the street-level tile named by its id. */
export async function findPlaceInTiles(id: string, at?: { x: number; y: number }): Promise<TilePlace | null> {
  const t = at ?? tileOfId(id);
  if (!t) return null;
  const bytes = await getPlacesTile(PLACE_TILE_ZOOM, t.x, t.y).catch(() => null);
  if (!bytes) return null;
  const vt = new VectorTile(new Protobuf(bytes));
  for (const layer of ["places", "landmarks"]) {
    const l = vt.layers[layer];
    if (!l) continue;
    for (let i = 0; i < l.length; i++) {
      const f = l.feature(i);
      if (f.properties.id !== id) continue;
      const geo = f.toGeoJSON(t.x, t.y, PLACE_TILE_ZOOM);
      const [lon, lat] = (geo.geometry as GeoJSON.Point).coordinates;
      let footprint: GeoJSON.Geometry | null = null;
      const fl = vt.layers.footprints;
      if (fl) {
        for (let j = 0; j < fl.length; j++) {
          const ff = fl.feature(j);
          if (ff.properties.id === id) footprint = ff.toGeoJSON(t.x, t.y, PLACE_TILE_ZOOM).geometry;
        }
      }
      return { id, lon, lat, props: f.properties as TilePlace["props"], footprint };
    }
  }
  return null;
}
