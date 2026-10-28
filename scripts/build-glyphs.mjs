/**
 * Builds map label fonts (SDF glyph files) from Noto Sans, so labels work
 * with the free/offline map style without a font server. Mapbox serves its own
 * fonts when a token is set. Covers Latin, Greek, Cyrillic, Vietnamese and
 * Devanagari; other scripts fall back to the system font for CJK only.
 *
 *   node scripts/build-glyphs.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { generateGlyphPbfFiles } from "maplibre-font-maker-node";

const dir = "node_modules/@fontsource/noto-sans/files";
const subsets = ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese", "devanagari"];
const ranges = [];
for (let start = 0; start < 0x2c00; start += 256) ranges.push({ start, end: start + 255 });

for (const [weight, label] of [[400, "Regular"], [700, "Bold"]]) {
  const fontstack = `Noto Sans ${label}`;
  const fonts = await Promise.all(
    subsets.map(async (s) => ({ name: `${s}-${weight}`, bytes: new Uint8Array(await fs.readFile(path.join(dir, `noto-sans-${s}-${weight}-normal.woff`))) })),
  );
  const files = await generateGlyphPbfFiles({ fontstack, fonts, ranges });
  for (const f of files) {
    const out = path.join("public/fonts", f.filename);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, f.bytes);
  }
  console.log(fontstack, files.length, "files");
}
