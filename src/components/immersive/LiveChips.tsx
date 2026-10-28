"use client";

/** Local time and current weather at the place, so it feels live. */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { formatLocalTime, partOfDay, timeZoneAt } from "@/lib/localTime";
import type { Place } from "@/lib/types";
import type { Weather } from "@/server/weather";

export default function LiveChips({ place }: { place: Place }) {
  const tz = useMemo(() => timeZoneAt(place.lat, place.lon), [place.lat, place.lon]);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ weather: Weather | null }>(`/api/places/${place.id}/weather`)
      .then((r) => alive && setWeather(r.weather))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [place.id]);

  const time = formatLocalTime(tz, now);
  const part = partOfDay(tz, now);

  return (
    <div className="live-chips">
      {time && (
        <span className="chip-live" title={tz ?? undefined}>
          <span aria-hidden="true">{part === "night" ? "🌙" : part === "evening" ? "🌇" : part === "morning" ? "🌅" : "🕐"}</span>
          {time} local time
        </span>
      )}
      {weather && (
        <span className="chip-live" title="Weather from MET Norway">
          <span aria-hidden="true">{weather.icon}</span>
          {weather.temperatureC}°C · {weather.summary}
        </span>
      )}
    </div>
  );
}
