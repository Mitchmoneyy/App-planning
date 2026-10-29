/**
 * The globe's style for the app: the website's own style (shared file
 * ../../../src/lib/map/style.ts) with Mapbox imagery, minus the web-only
 * overlays (prayer arcs, request lights). The app draws its own highlight.
 */
import { buildStyle, type Theme } from "../../../src/lib/map/style";
import { SITE_URL } from "./config";

const WEB_ONLY = new Set(["arcs", "arrivals", "requests", "me", "pick", "selected-fp", "selected-pt"]);

export function appStyle(theme: Theme): string {
  const style = buildStyle({ provider: "mapbox", theme, origin: SITE_URL });
  style.layers = (style.layers as { source?: string }[]).filter((l) => !l.source || !WEB_ONLY.has(l.source));
  for (const id of WEB_ONLY) delete style.sources[id];
  return JSON.stringify(style);
}
