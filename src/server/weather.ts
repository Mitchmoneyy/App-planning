/**
 * Current weather at a place, from MET Norway's free Locationforecast API
 * (no key; commercial use allowed with credit; they require a User-Agent
 * that identifies the app). Cached for 30 minutes per place.
 */
import "server-only";

const CONTACT = process.env.WIKIMEDIA_CONTACT || "https://github.com/Mitchmoneyy/App-planning";

export interface Weather {
  temperatureC: number;
  /** MET Norway symbol code, e.g. "partlycloudy_day". */
  symbol: string;
  summary: string;
  icon: string;
  windMs: number | null;
}

const cache = new Map<string, { data: Weather | null; expires: number }>();

const SUMMARIES: [RegExp, string, string][] = [
  [/thunder/, "Thunderstorms", "⛈️"],
  [/snow/, "Snow", "🌨️"],
  [/sleet/, "Sleet", "🌨️"],
  [/heavyrain|rainshowers|rain/, "Rain", "🌧️"],
  [/fog/, "Fog", "🌫️"],
  [/partlycloudy/, "Partly cloudy", "⛅"],
  [/fair/, "Mostly clear", "🌤️"],
  [/clearsky_night/, "Clear night", "🌙"],
  [/clearsky/, "Clear sky", "☀️"],
  [/cloudy/, "Cloudy", "☁️"],
];

export function describeSymbol(symbol: string) {
  const hit = SUMMARIES.find(([re]) => re.test(symbol));
  return hit ? { summary: hit[1], icon: hit[2] } : { summary: "—", icon: "🌡️" };
}

export async function getWeather(lat: number, lon: number): Promise<Weather | null> {
  // MET asks for coordinates with at most 4 decimals; 2 is plenty and caches better.
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  let data: Weather | null = null;
  try {
    const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`, {
      headers: { "User-Agent": `GlobalSanctuary/0.1 (${CONTACT})` },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        properties?: {
          timeseries?: {
            data: {
              instant: { details: { air_temperature?: number; wind_speed?: number } };
              next_1_hours?: { summary: { symbol_code: string } };
              next_6_hours?: { summary: { symbol_code: string } };
            };
          }[];
        };
      };
      const now = json.properties?.timeseries?.[0]?.data;
      if (now && typeof now.instant.details.air_temperature === "number") {
        const symbol = now.next_1_hours?.summary.symbol_code ?? now.next_6_hours?.summary.symbol_code ?? "";
        data = {
          temperatureC: Math.round(now.instant.details.air_temperature),
          symbol,
          windMs: now.instant.details.wind_speed ?? null,
          ...describeSymbol(symbol),
        };
      }
    }
  } catch {
    data = null;
  }

  cache.set(key, { data, expires: Date.now() + (data ? 30 : 5) * 60 * 1000 });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return data;
}
