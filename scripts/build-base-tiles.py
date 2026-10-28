"""
Turn the bundled NASA day/night Earth images (equirectangular, 4096x2048) into
Web Mercator map tiles (zoom 0-4). These are the offline/no-key fallback for
the globe; real satellite imagery streams from Mapbox when a token is set.

    python3 scripts/build-base-tiles.py
"""
import math, os
from PIL import Image

SRC = {"day": "public/textures/earth-day.jpg", "night": "public/textures/earth-night.jpg"}
MAX_Z = 4

for name, path in SRC.items():
    src = Image.open(path).convert("RGB")
    W, H = src.size
    size = 256 * 2 ** MAX_Z
    # For every output row, find the source latitude row (Mercator -> equirect).
    rows = []
    for py in range(size):
        y = math.pi * (1 - 2 * (py + 0.5) / size)
        lat = math.degrees(math.atan(math.sinh(y)))
        rows.append(min(H - 1, max(0, int((90 - lat) / 180 * H))))
    merc = Image.new("RGB", (W, size))
    for py, sy in enumerate(rows):
        merc.paste(src.crop((0, sy, W, sy + 1)), (0, py))
    merc = merc.resize((size, size), Image.LANCZOS)
    for z in range(MAX_Z + 1):
        n = 2 ** z
        level = merc.resize((256 * n, 256 * n), Image.LANCZOS) if z < MAX_Z else merc
        for x in range(n):
            os.makedirs(f"public/tiles/{name}/{z}/{x}", exist_ok=True)
            for y in range(n):
                level.crop((x * 256, y * 256, (x + 1) * 256, (y + 1) * 256)).save(
                    f"public/tiles/{name}/{z}/{x}/{y}.jpg", quality=86, optimize=True)
    print(name, "done")
