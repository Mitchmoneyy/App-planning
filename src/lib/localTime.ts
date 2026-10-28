/** Local time at a place, from its coordinates (offline time-zone lookup). */
import tzlookup from "@photostructure/tz-lookup";

export function timeZoneAt(lat: number, lon: number): string | null {
  try {
    return tzlookup(lat, lon);
  } catch {
    return null;
  }
}

/** "6:42 PM" (in the viewer's own clock style) */
export function formatLocalTime(timeZone: string | null, date = new Date()): string | null {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  } catch {
    return null;
  }
}

/** Rough part of the day there, used for gentle wording ("evening in Kyoto"). */
export function partOfDay(timeZone: string | null, date = new Date()): "morning" | "afternoon" | "evening" | "night" | null {
  if (!timeZone) return null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(date));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
