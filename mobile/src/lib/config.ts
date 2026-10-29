/** App settings: from app.json (expo.extra) or EXPO_PUBLIC_* environment variables. */
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

/** The Global Sanctuary website (its API serves the map tiles, search and places). */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || extra.siteUrl || "").replace(/\/$/, "");
export const SITE_HOST = SITE_URL ? new URL(SITE_URL).host : "";

/** Public Mapbox token (pk.…), the same one the website uses. */
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || extra.mapboxToken || "";

/** Marks requests from the app, so the website hides its own tab bar inside it. */
export const APP_USER_AGENT = "GlobalSanctuaryApp/1.0";
