"use client";

/**
 * "Prayers for your area": prayers sent to your city and country, and where
 * in the world they came from (country/city level only).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobe } from "../globe/GlobeContext";
import { useMe } from "../MeProvider";
import AreaPicker, { flag } from "./AreaPicker";
import { WorldPrayerItem } from "./WorldItems";
import { useCityIndex } from "@/hooks/useCityIndex";
import type { AreaView, SettingsView, WorldPrayerView } from "@/lib/apiTypes";
import { api } from "@/lib/client";
import type { Area } from "@/lib/cities";

interface AreaResponse {
  area: AreaView;
  summary: { toCity: number; toCountry: number; fromCountries: { cc: string; count: number; name: string }[] };
  cityPrayers: WorldPrayerView[];
  countryPrayers: WorldPrayerView[];
  requestCount: number;
}

export default function AreaPanel() {
  const { me } = useMe();
  const { api: globe, location, setPick } = useGlobe();
  const index = useCityIndex();
  const [area, setArea] = useState<Area | null>(null);
  const [data, setData] = useState<AreaResponse | null>(null);
  const [scope, setScope] = useState<"city" | "country">("city");

  // Default area (once): saved home (signed in), else where you are now (rounded).
  const defaulted = useRef(false);
  useEffect(() => {
    if (!index || area || defaulted.current) return;
    let alive = true;
    (async () => {
      if (me?.user) {
        const s = await api<SettingsView>("/api/me/settings").catch(() => null);
        if (s?.home && alive) {
          defaulted.current = true;
          const c = s.home.cityId !== null ? index.city(s.home.cityId) : null;
          setArea(c ? index.cityArea(c) : index.countryArea(s.home.cc));
          return;
        }
      }
      if (location && alive) {
        defaulted.current = true;
        setArea(index.snap(location.lat, location.lon));
      }
    })();
    return () => {
      alive = false;
    };
  }, [index, me?.user, location, area]);

  const load = useCallback(async (a: Area) => {
    const q = a.kind === "city" ? `cityId=${a.cityId}` : `cc=${a.cc}`;
    setData(await api<AreaResponse>(`/api/world/area?${q}`));
    setScope(a.kind === "city" ? "city" : "country");
  }, []);

  useEffect(() => {
    if (!area) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the area changes
    load(area).catch(() => setData(null));
    setPick({ lat: area.lat, lon: area.lon, label: area.kind === "city" ? area.name : area.country });
    globe?.flyTo(area.lat, area.lon, area.kind === "city" ? 1.4 : 1.8, 1800);
    return () => setPick(null);
  }, [area, load, globe, setPick]);

  const list = scope === "city" ? (data?.cityPrayers ?? []) : (data?.countryPrayers ?? []);
  const count = scope === "city" ? data?.summary.toCity : data?.summary.toCountry;

  return (
    <aside className="side-panel panel-glass" aria-label="Prayers for your area">
      <header className="side-panel__head">
        <Link href="/" className="close-x" aria-label="Close">
          ×
        </Link>
        <p className="eyebrow">Someone is praying for you</p>
        <h1>Prayers for your area</h1>
        <AreaPicker value={area} onChange={setArea} />
      </header>

      <div className="side-panel__scroll">
        {!area && <p className="muted">Choose your city or country to see the prayers people around the world have sent there.</p>}

        {data && (
          <>
            <div className="area-hero">
              <p className="area-hero__count">{(count ?? 0).toLocaleString()}</p>
              <p className="area-hero__label">
                prayer{count === 1 ? "" : "s"} sent to {scope === "city" && data.area.kind === "city" ? data.area.name : data.area.country}
              </p>
              {data.area.kind === "city" && (
                <div className="seg">
                  <button type="button" className={scope === "city" ? "is-on" : ""} onClick={() => setScope("city")}>
                    {data.area.name}
                  </button>
                  <button type="button" className={scope === "country" ? "is-on" : ""} onClick={() => setScope("country")}>
                    All of {data.area.country}
                  </button>
                </div>
              )}
            </div>

            {data.summary.fromCountries.length > 0 && (
              <section>
                <h2 className="section-title">Sent with love from</h2>
                <ul className="from-list">
                  {data.summary.fromCountries.slice(0, 12).map((c) => (
                    <li key={c.cc}>
                      <span aria-hidden="true">{flag(c.cc)}</span> {c.name} <span className="muted">× {c.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <h2 className="section-title">Recent prayers</h2>
            {list.length === 0 ? (
              <p className="muted">
                No prayers here yet. <Link href="/world">Send one</Link>, or{" "}
                <Link href="/world?tab=requests">ask others to pray for you</Link>.
              </p>
            ) : (
              <ul className="wp-list">
                {list.map((p) => (
                  <WorldPrayerItem key={p.id} prayer={p} onHidden={() => setData((d) => (d ? { ...d, cityPrayers: d.cityPrayers.filter((x) => x.id !== p.id), countryPrayers: d.countryPrayers.filter((x) => x.id !== p.id) } : d))} />
                ))}
              </ul>
            )}

            {!me?.user && (
              <p className="notice">
                <Link href="/signin?mode=signup&next=/area">Create a free account</Link> to be notified when someone prays for your city.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
