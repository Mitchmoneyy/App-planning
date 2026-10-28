"""
Find the building footprint for each place of worship, from Overture Maps
Buildings (mostly OpenStreetMap, ODbL; plus Microsoft/Google ML footprints).

Only reads the row groups whose bounding box covers a target point, so it
scales with the number of places, not the size of the planet.

    python pipeline/overture_footprints.py targets.ndjson footprints.ndjson

targets.ndjson: one {"id", "lon", "lat"} per line.
Output: {"id", "building", "class", "height", "geometry": GeoJSON, "centroid": [lon, lat], "match"}.
Needs: pyarrow fsspec aiohttp shapely.
"""
import json, os, re, sys, threading, time, urllib.parse, urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import fsspec
import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import Point, mapping

BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-10-21.0")
RELIGIOUS = {"church", "cathedral", "chapel", "mosque", "temple", "synagogue", "shrine", "religious", "monastery", "presbytery", "kingdom_hall", "gurdwara"}
M = 1 / 111_320  # degrees per metre (latitude)


def list_keys():
    keys, tok = [], None
    while True:
        u = f"{BUCKET}/?list-type=2&prefix=release/{RELEASE}/theme=buildings/type=building/"
        if tok:
            u += "&continuation-token=" + urllib.parse.quote(tok)
        body = urllib.request.urlopen(u, timeout=60).read().decode()
        keys += re.findall(r"<Key>([^<]+\.parquet)</Key>", body)
        m = re.search(r"<NextContinuationToken>([^<]+)", body)
        if not m:
            return keys
        tok = m.group(1)


fs = fsspec.filesystem("http", client_kwargs={"trust_env": True})


def retry(fn, *a):
    for i in range(6):
        try:
            return fn(*a)
        except Exception as e:
            err = e
            time.sleep(2 ** i)
    raise err


def rg_boxes(key):
    """[(rg, xmin, xmax, ymin, ymax)] from the footer statistics."""
    md = pq.ParquetFile(fs.open(f"{BUCKET}/{key}")).metadata
    names = [md.row_group(0).column(i).path_in_schema for i in range(md.num_columns)]
    ix = {n: names.index(n) for n in ("bbox.xmin", "bbox.xmax", "bbox.ymin", "bbox.ymax")}
    out = []
    for g in range(md.num_row_groups):
        rg = md.row_group(g)
        s = {n: rg.column(i).statistics for n, i in ix.items()}
        out.append((g, s["bbox.xmin"].min, s["bbox.xmax"].max, s["bbox.ymin"].min, s["bbox.ymax"].max))
    return key, out


def read_group(key, g, pts):
    f = pq.ParquetFile(fs.open(f"{BUCKET}/{key}", block_size=4 << 20, cache_type="none"))
    head = f.read_row_group(g, columns=["bbox"]).column("bbox").to_pylist()
    pad = 120 * M
    keep = []
    for i, b in enumerate(head):
        for (_, lon, lat) in pts:
            dx = pad / max(0.2, abs(__import__("math").cos(lat * 0.0174533)))
            if b["xmin"] - dx <= lon <= b["xmax"] + dx and b["ymin"] - pad <= lat <= b["ymax"] + pad:
                keep.append(i)
                break
    if not keep:
        return []
    t = f.read_row_group(g, columns=["id", "geometry", "class", "height", "num_floors", "names"]).take(keep).to_pylist()
    return [{"building": r["id"], "geom": wkb.loads(r["geometry"]), "class": r["class"],
             "height": r["height"] or (r["num_floors"] * 3.5 if r["num_floors"] else None),
             "name": (r["names"] or {}).get("primary")} for r in t]


def best(pt, cands):
    p = Point(pt[1], pt[2])
    def dist_m(b):
        return b["geom"].distance(p) / M
    inside = [b for b in cands if b["geom"].covers(p)]
    rel = [b for b in cands if b["class"] in RELIGIOUS and dist_m(b) <= 60]
    if inside:
        inside.sort(key=lambda b: (b["class"] not in RELIGIOUS, b["geom"].area))
        if inside[0]["class"] in RELIGIOUS or not rel:
            return inside[0], "contains"
    if rel:
        return min(rel, key=dist_m), "nearest-religious"
    near = [b for b in cands if dist_m(b) <= 12]
    return (min(near, key=dist_m), "nearest") if near else (None, None)


def main(src, dst):
    pts = [json.loads(l) for l in open(src)]
    pts = [(p["id"], p["lon"], p["lat"]) for p in pts]
    keys = list_keys()
    print(len(keys), "building files; reading footers", flush=True)
    jobs = defaultdict(list)  # (key, rg) -> points
    with ThreadPoolExecutor(32) as ex:
        for fut in as_completed([ex.submit(retry, rg_boxes, k) for k in keys]):
            key, boxes = fut.result()
            for (g, x0, x1, y0, y1) in boxes:
                for p in pts:
                    if x0 - 0.002 <= p[1] <= x1 + 0.002 and y0 - 0.002 <= p[2] <= y1 + 0.002:
                        jobs[(key, g)].append(p)
    print(len(jobs), "row groups to read", flush=True)
    cands = defaultdict(list)
    done = 0
    with ThreadPoolExecutor(24) as ex:
        futs = {ex.submit(retry, read_group, k, g, ps): ps for (k, g), ps in jobs.items()}
        for fut in as_completed(futs):
            bs = fut.result()
            for p in futs[fut]:
                cands[p[0]] += bs
            done += 1
            if done % 100 == 0:
                print(done, "/", len(jobs), flush=True)
    n = 0
    with open(dst, "w") as out:
        for p in pts:
            b, how = best(p, cands[p[0]])
            if not b:
                continue
            g = b["geom"]
            c = g.centroid if g.covers(g.centroid) else g.representative_point()
            out.write(json.dumps({"id": p[0], "building": b["building"], "class": b["class"], "height": b["height"],
                                  "buildingName": b["name"], "match": how,
                                  "centroid": [round(c.x, 7), round(c.y, 7)],
                                  "geometry": mapping(g.simplify(0.0000015))}) + "\n")
            n += 1
    print(f"footprints for {n}/{len(pts)} places", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
