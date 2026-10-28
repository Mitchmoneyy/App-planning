"use client";

/**
 * "Send a prayer or blessing" to any city or country. Pick the place by
 * searching or by clicking the globe; choose a blessing from several
 * traditions or write your own; share where you're praying from (city,
 * country, or not at all).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGlobe } from "../globe/GlobeContext";
import { useMe } from "../MeProvider";
import { SupportNote } from "../PrayerSpace";
import AreaPicker, { areaPayload, flag } from "./AreaPicker";
import { useCityIndex } from "@/hooks/useCityIndex";
import type { WorldPrayerView } from "@/lib/apiTypes";
import { api, ApiError } from "@/lib/client";
import { BLESSINGS, FAITH_OPTIONS } from "@/lib/blessings";
import type { Area } from "@/lib/cities";

type OriginMode = "city" | "country" | "none";

export default function Composer({ onSent }: { onSent?(p: WorldPrayerView): void }) {
  const { me } = useMe();
  const { api: globe, setGlobeClickHandler, setPick, addActivity, refreshActivity, location, requestLocation } = useGlobe();
  const index = useCityIndex();

  const [target, setTarget] = useState<Area | null>(null);
  const [templateId, setTemplateId] = useState<string | null>("strength");
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [name, setName] = useState("");
  const [originMode, setOriginMode] = useState<OriginMode>("country");
  const [faith, setFaith] = useState("");
  const [showFaith, setShowFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; selfHarm?: boolean } | null>(null);

  // Where the sender is, rounded to a city (in the browser) — never exact.
  const myArea = useMemo(() => (index && location ? index.snap(location.lat, location.lon) : null), [index, location]);
  const origin: Area | null =
    originMode === "none" || !myArea ? null : originMode === "country" ? (index?.countryArea(myArea.cc) ?? null) : myArea;

  const choose = useCallback(
    (area: Area | null) => {
      setTarget(area);
      setResult(null);
      setPick(area ? { lat: area.lat, lon: area.lon, label: area.kind === "city" ? area.name : area.country } : null);
      if (area) globe?.flyTo(area.lat, area.lon, area.kind === "city" ? 6 : 4, 1800);
    },
    [globe, setPick],
  );

  // Clicking the globe picks the nearest city.
  useEffect(() => {
    setGlobeClickHandler((lat, lon) => {
      const area = index?.snap(lat, lon);
      if (area) choose(area);
    });
    return () => {
      setGlobeClickHandler(null);
      setPick(null);
    };
  }, [index, choose, setGlobeClickHandler, setPick]);

  const placeName = target ? (target.kind === "city" ? target.name : target.country) : "this place";

  async function send() {
    if (!target) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ message: string; status: string; selfHarm: boolean; prayer: WorldPrayerView }>("/api/world/prayers", {
        body: {
          target: areaPayload(target),
          origin: areaPayload(origin),
          text: text.trim() || undefined,
          templateId: text.trim() ? undefined : templateId,
          anonymous,
          name: name || me?.user?.displayName,
          faith: faith || undefined,
          showFaith,
        },
      });
      setResult({ ok: true, message: res.message, selfHarm: res.selfHarm });
      setText("");
      if (res.status === "published") {
        // Show the arc right away.
        addActivity({
          id: `local-${res.prayer.id}`,
          from: origin ? { lat: origin.lat, lon: origin.lon, label: origin.name } : null,
          to: { lat: target.lat, lon: target.lon, label: target.name },
          createdAt: new Date().toISOString(),
        });
        if (origin) globe?.flyTo((origin.lat + target.lat) / 2, (origin.lon + target.lon) / 2, 1.6, 2000);
        window.setTimeout(refreshActivity, 2500);
        onSent?.(res.prayer);
      }
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as { selfHarm?: boolean } | null) : null;
      setResult({ ok: false, message: err instanceof ApiError ? err.message : "Couldn't send just now.", selfHarm: data?.selfHarm });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer">
      <AreaPicker value={target} onChange={choose} label="Send to" placeholder="Search a city or country, or click the globe" allowLocation={false} />
      {!target && <p className="hint">Tip: click anywhere on the globe to choose the nearest city.</p>}

      {target && (
        <>
          <fieldset className="blessings-field">
            <legend>Choose a blessing</legend>
            <div className="blessings">
              {BLESSINGS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`blessing${!text && templateId === b.id ? " is-on" : ""}`}
                  onClick={() => {
                    setTemplateId(b.id);
                    setText("");
                  }}
                >
                  <small>{b.tradition}</small>
                  {b.text.replace("{place}", placeName)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>Or write your own</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} placeholder={`Hold ${placeName} in your prayers…`} />
          </label>

          <details className="options">
            <summary>Sharing options</summary>
            <div className="options__body">
              <label className="toggle">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                Send anonymously
              </label>
              {!anonymous && (
                <label className="field">
                  <span>Name to show</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={me?.user?.displayName ?? "First name"} />
                </label>
              )}

              <div className="field">
                <span>Show where you&apos;re praying from</span>
                {myArea ? (
                  <div className="seg">
                    <button type="button" className={originMode === "city" ? "is-on" : ""} onClick={() => setOriginMode("city")}>
                      {flag(myArea.cc)} {myArea.kind === "city" ? myArea.name : myArea.country}
                    </button>
                    <button type="button" className={originMode === "country" ? "is-on" : ""} onClick={() => setOriginMode("country")}>
                      {myArea.country} only
                    </button>
                    <button type="button" className={originMode === "none" ? "is-on" : ""} onClick={() => setOriginMode("none")}>
                      Don&apos;t show
                    </button>
                  </div>
                ) : (
                  <p className="hint">
                    <button type="button" className="link-button" onClick={requestLocation}>
                      Use my location
                    </button>{" "}
                    to draw your prayer travelling across the globe. It&apos;s rounded to your city or country, never exact.
                  </p>
                )}
              </div>

              <label className="field">
                <span>Your faith or tradition (optional)</span>
                <select value={faith} onChange={(e) => setFaith(e.target.value)}>
                  <option value="">Prefer not to say</option>
                  {FAITH_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {faith && (
                <label className="toggle">
                  <input type="checkbox" checked={showFaith} onChange={(e) => setShowFaith(e.target.checked)} />
                  Show my faith with this prayer
                </label>
              )}
            </div>
          </details>

          <button type="button" className="send-button" onClick={send} disabled={busy || (!text.trim() && !templateId)}>
            {busy ? "Sending…" : `Send to ${placeName}`}
            <span aria-hidden="true"> ✧</span>
          </button>
        </>
      )}

      {result && (
        <p className={`form-message${result.ok ? "" : " is-error"}`} role="status">
          {result.message}
        </p>
      )}
      {result?.selfHarm && <SupportNote />}
    </div>
  );
}
