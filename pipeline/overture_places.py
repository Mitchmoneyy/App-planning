"""
Extract every place of worship from Overture Maps Places (CDLA-Permissive 2.0).

Reads the public GeoParquet files over HTTPS, row group by row group, and only
downloads the full columns for row groups that contain religious places, so
the whole world takes a few GB of transfer rather than ~12 GB.

    python pipeline/overture_places.py --release 2026-10-21.0 --out pipeline/out/overture

Writes one gzipped NDJSON file per Parquet file. Needs: pyarrow fsspec aiohttp.
"""
import argparse, gzip, json, os, re, struct, sys, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import fsspec
import pyarrow.parquet as pq

BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"

# Overture categories that are places people go to worship.
WORSHIP_BASIC = {
    "christian_place_of_worship", "jewish_place_of_worship", "buddhist_place_of_worship",
    "muslim_place_of_worship", "hindu_place_of_worship", "place_of_worship", "religious_landmark",
    "sikh_place_of_worship",
}
EXTRA_PRIMARY = {"shinto_shrine", "monastery", "temple", "mosque", "synagogue", "church_cathedral",
                 "buddhist_temple", "hindu_temple", "sikh_temple", "convent", "abbey", "shrine"}
SKIP_PRIMARY = {"wedding_chapel", "religious_school", "religious_organization", "church_supply_store",
                "religious_and_spiritual_goods_store", "buddhist_goods_store", "jewish_restaurant"}

COLUMNS = ["id", "geometry", "names", "addresses", "websites", "confidence", "operating_status", "basic_category", "taxonomy"]


def latest_release():
    body = urllib.request.urlopen(f"{BUCKET}/?list-type=2&prefix=release/&delimiter=/", timeout=60).read().decode()
    return sorted(re.findall(r"<Prefix>release/([^<]+)/</Prefix>", body))[-1]


def list_files(release):
    keys, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&prefix=release/{release}/theme=places/type=place/"
        if token:
            url += "&continuation-token=" + urllib.parse.quote(token)
        body = urllib.request.urlopen(url, timeout=60).read().decode()
        keys += re.findall(r"<Key>([^<]+\.parquet)</Key>", body)
        m = re.search(r"<NextContinuationToken>([^<]+)", body)
        if not m:
            return keys
        token = m.group(1)


def is_worship(basic, tax):
    primary = (tax or {}).get("primary")
    if primary in SKIP_PRIMARY:
        return False
    if basic in WORSHIP_BASIC or primary in EXTRA_PRIMARY:
        return True
    if primary and primary.endswith("_place_of_worship"):
        return True
    return "place_of_worship" in ((tax or {}).get("hierarchy") or [])


def point(wkb):
    # WKB point: byte order, type, x, y
    bo = "<" if wkb[0] == 1 else ">"
    x, y = struct.unpack(bo + "dd", wkb[5:21])
    return round(x, 7), round(y, 7)


_local = threading.local()


def open_file(fs, url):
    cache = getattr(_local, "files", None)
    if cache is None:
        cache = _local.files = {}
    if url not in cache:
        cache[url] = pq.ParquetFile(fs.open(url, block_size=2 << 20, cache_type="none"))
    return cache[url]


def do_row_group(fs, url, rg):
    for attempt in range(5):
        try:
            f = open_file(fs, url)
            head = f.read_row_group(rg, columns=["basic_category", "taxonomy"])
            basics = head.column("basic_category").to_pylist()
            taxes = head.column("taxonomy").to_pylist()
            keep = [i for i in range(len(basics)) if is_worship(basics[i], taxes[i])]
            if not keep:
                return []
            t = f.read_row_group(rg, columns=COLUMNS).take(keep).to_pylist()
            out = []
            for r in t:
                lon, lat = point(r["geometry"])
                addr = (r["addresses"] or [{}])[0] or {}
                out.append({
                    "id": r["id"], "lon": lon, "lat": lat,
                    "name": (r["names"] or {}).get("primary"),
                    "category": (r["taxonomy"] or {}).get("primary") or r["basic_category"],
                    "address": addr.get("freeform"), "locality": addr.get("locality"),
                    "region": addr.get("region"), "postcode": addr.get("postcode"), "country": addr.get("country"),
                    "website": (r["websites"] or [None])[0],
                    "confidence": round(r["confidence"] or 0, 3),
                    "status": r["operating_status"],
                })
            return out
        except Exception as e:  # network blips: retry
            _local.files = {}
            time.sleep(2 ** attempt)
            last = e
    print(f"FAILED {url} rg {rg}: {last}", file=sys.stderr)
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", default="latest")
    ap.add_argument("--out", default="pipeline/out/overture")
    ap.add_argument("--workers", type=int, default=24)
    ap.add_argument("--limit-files", type=int, default=0)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    fs = fsspec.filesystem("http", client_kwargs={"trust_env": True})
    release = latest_release() if a.release == "latest" else a.release
    print("Overture release", release, flush=True)
    keys = list_files(release)
    if a.limit_files:
        keys = keys[: a.limit_files]
    print(f"{len(keys)} files", flush=True)
    for n, key in enumerate(keys):
        dest = os.path.join(a.out, f"part-{n:05d}.ndjson.gz")
        if os.path.exists(dest):
            continue
        url = f"{BUCKET}/{key}"
        groups = pq.ParquetFile(fs.open(url)).metadata.num_row_groups
        t0, rows = time.time(), []
        with ThreadPoolExecutor(a.workers) as ex:
            for fut in as_completed([ex.submit(do_row_group, fs, url, g) for g in range(groups)]):
                rows += fut.result()
        with gzip.open(dest + ".tmp", "wt") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        os.rename(dest + ".tmp", dest)
        print(f"file {n + 1}/{len(keys)}: {len(rows)} places in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
