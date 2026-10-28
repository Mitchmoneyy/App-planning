"use client";

/** Ask others to pray for you (account required; tied to your city or country, never exact). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "../MeProvider";
import { SupportNote } from "../PrayerSpace";
import AreaPicker, { areaPayload } from "./AreaPicker";
import { useCityIndex } from "@/hooks/useCityIndex";
import type { RequestView, SettingsView } from "@/lib/apiTypes";
import { api, ApiError } from "@/lib/client";
import { FAITH_OPTIONS } from "@/lib/blessings";
import type { Area } from "@/lib/cities";

export default function RequestForm({ onPosted }: { onPosted(r: RequestView): void }) {
  const { me } = useMe();
  const index = useCityIndex();
  const [area, setArea] = useState<Area | null>(null);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [anonymous, setAnonymous] = useState(true);
  const [faith, setFaith] = useState("");
  const [showFaith, setShowFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; selfHarm?: boolean } | null>(null);

  // Start from the person's saved home area.
  useEffect(() => {
    if (!me?.user || !index) return;
    api<SettingsView>("/api/me/settings")
      .then((s) => {
        if (!s.home) return;
        const a = s.home.kind === "city" && s.home.cityId !== null ? index.city(s.home.cityId) : null;
        setArea(a ? index.cityArea(a) : index.countryArea(s.home.cc));
      })
      .catch(() => {});
  }, [me?.user, index]);

  if (!me?.user) {
    return (
      <div className="notice">
        <p>
          <strong>Ask the world to pray for you.</strong> To share a request and be told when someone prays for you, please{" "}
          <Link href="/signin?next=/world?tab=requests">sign in or create a free account</Link>.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!area) return setResult({ ok: false, message: "Please choose your city or country." });
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ message: string; selfHarm: boolean; request: RequestView }>("/api/world/requests", {
        body: { text, area: areaPayload(area), visibility, anonymous, faith: faith || undefined, showFaith },
      });
      setResult({ ok: true, message: res.message, selfHarm: res.selfHarm });
      setText("");
      onPosted(res.request);
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as { selfHarm?: boolean } | null) : null;
      setResult({ ok: false, message: err instanceof ApiError ? err.message : "Couldn't share just now.", selfHarm: data?.selfHarm });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="request-form" onSubmit={submit}>
      <label className="field">
        <span>What would you like prayers for?</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={800} placeholder="Share as much or as little as you like." required />
      </label>
      <AreaPicker value={area} onChange={setArea} label="Your area (shown as a city or country only)" />

      <div className="field">
        <span>Who can see it</span>
        <div className="seg">
          <button type="button" className={visibility === "public" ? "is-on" : ""} onClick={() => setVisibility("public")}>
            Everyone (on the globe)
          </button>
          <button type="button" className={visibility === "unlisted" ? "is-on" : ""} onClick={() => setVisibility("unlisted")}>
            Only people I share the link with
          </button>
        </div>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        Post anonymously (otherwise your first name, {me.user.displayName}, is shown)
      </label>
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
          Show my faith on the request
        </label>
      )}
      <button type="submit" className="send-button" disabled={busy || text.trim().length < 10}>
        {busy ? "Sharing…" : "Ask for prayers"}
      </button>
      <p className="hint">You&apos;ll be notified when someone prays for you. Change how in My sanctuary.</p>
      {result && <p className={`form-message${result.ok ? "" : " is-error"}`}>{result.message}</p>}
      {result?.selfHarm && <SupportNote />}
    </form>
  );
}
