"use client";

/** List items for prayers sent to places, and prayer requests. */
import Link from "next/link";
import { useState } from "react";
import SafetyMenu from "../SafetyMenu";
import { flag } from "./AreaPicker";
import { useGlobe } from "../globe/GlobeContext";
import { loadCityIndex } from "@/hooks/useCityIndex";
import type { RequestView, WorldPrayerView } from "@/lib/apiTypes";
import { api, ApiError, timeAgo } from "@/lib/client";
import { BLESSINGS } from "@/lib/blessings";

const areaText = (a: { kind: string; name: string; country: string }) => (a.kind === "city" ? `${a.name}, ${a.country}` : a.country);

export function WorldPrayerItem({ prayer, onHidden }: { prayer: WorldPrayerView; onHidden?(): void }) {
  const { api: globe } = useGlobe();
  return (
    <li className="wp">
      <p className="wp__route">
        {prayer.origin ? (
          <>
            <span aria-hidden="true">{flag(prayer.origin.cc)}</span> {areaText(prayer.origin)}
          </>
        ) : (
          "Somewhere in the world"
        )}
        <span className="wp__arrow" aria-label="to">
          {" "}
          ⟶{" "}
        </span>
        <button type="button" className="link-button" onClick={() => globe?.flyTo(prayer.target.lat, prayer.target.lon, prayer.target.kind === "city" ? 9 : 4.5)}>
          <span aria-hidden="true">{flag(prayer.target.cc)}</span> {areaText(prayer.target)}
        </button>
      </p>
      <p className="wp__body">{prayer.body}</p>
      <div className="wp__meta">
        <span>
          {prayer.name ?? "Anonymous"}
          {prayer.faith && <> · {prayer.faith}</>} · {timeAgo(prayer.createdAt)}
        </span>
        {!prayer.mine && onHidden && <SafetyMenu target={{ kind: "world_prayer", id: prayer.id }} onHidden={onHidden} />}
      </div>
    </li>
  );
}

export function RequestCard({ request, onChange, onHidden }: { request: RequestView; onChange?(r: RequestView): void; onHidden?(): void }) {
  const { api: globe, addActivity, location } = useGlobe();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function pray(withWords: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      // Tell them which country the prayer came from (never the city or anything finer).
      const index = location ? await loadCityIndex().catch(() => null) : null;
      const near = index && location ? index.snap(location.lat, location.lon) : null;
      const country = near && index ? index.countryArea(near.cc) : null;
      const origin = country ? { cc: country.cc } : undefined;
      const res = await api<{ prayedCount: number; message?: string; already?: boolean }>(`/api/world/requests/${request.id}/pray`, {
        body: withWords ? { text: text || undefined, templateId: text ? undefined : templateId, origin } : { origin },
      });
      onChange?.({ ...request, prayedByMe: true, prayedCount: res.prayedCount });
      setMessage(res.already ? "You've already prayed for this. Thank you." : (res.message ?? "Thank you."));
      setOpen(false);
      if (!res.already) {
        addActivity({
          id: `local-${Date.now()}`,
          from: country ? { lat: country.lat, lon: country.lon, label: country.name } : null,
          to: { lat: request.area.lat, lon: request.area.lon, label: request.area.name },
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Couldn't send just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="req">
      <p className="req__where">
        <button type="button" className="link-button" onClick={() => globe?.flyTo(request.area.lat, request.area.lon, request.area.kind === "city" ? 9 : 4.5)}>
          <span aria-hidden="true">{flag(request.area.cc)}</span> {areaText(request.area)}
        </button>
        <span className="muted"> · {timeAgo(request.createdAt)}</span>
      </p>
      <p className="req__body">{request.body}</p>
      <p className="req__by muted">
        {request.name ?? "Anonymous"}
        {request.faith && <> · {request.faith}</>}
      </p>
      <div className="req__actions">
        {request.mine ? (
          <span className="tag">Your request</span>
        ) : request.prayedByMe ? (
          <span className="prayed-badge">✧ You prayed for this</span>
        ) : (
          <>
            <button type="button" className="pray-btn" onClick={() => pray(false)} disabled={busy}>
              <span aria-hidden="true">🙏</span> I prayed for this
            </button>
            <button type="button" className="link-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              Add words
            </button>
          </>
        )}
        <span className="req__count">
          {request.prayedCount > 0 ? `${request.prayedCount} ${request.prayedCount === 1 ? "person has" : "people have"} prayed` : "No prayers yet"}
        </span>
        <Link href={`/world/requests/${request.id}`} className="small-link">
          Open
        </Link>
        {!request.mine && onHidden && <SafetyMenu target={{ kind: "request", id: request.id }} onHidden={onHidden} />}
      </div>

      {open && (
        <div className="req__compose">
          <div className="blessings">
            {BLESSINGS.slice(0, 6).map((b) => (
              <button key={b.id} type="button" className={`blessing${templateId === b.id ? " is-on" : ""}`} onClick={() => setTemplateId(templateId === b.id ? null : b.id)}>
                <small>{b.tradition}</small>
                {b.text.replace("{place}", request.area.name)}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} placeholder="Or write a few words of your own…" />
          <button type="button" className="primary-button" onClick={() => pray(true)} disabled={busy || (!text.trim() && !templateId)}>
            {busy ? "Sending…" : "Send prayer"}
          </button>
        </div>
      )}
      {message && <p className="form-message">{message}</p>}
    </li>
  );
}
