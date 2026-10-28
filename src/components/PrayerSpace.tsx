"use client";

/**
 * The pieces of a place's prayer space (used inside the immersive view):
 * light a candle, offer a prayer (private or on the wall), pray for others.
 */
import { useCallback, useEffect, useState } from "react";
import { useMe } from "./MeProvider";
import SafetyMenu from "./SafetyMenu";
import type { PlaceStatsView, SubmitResult, WallPrayer } from "@/lib/apiTypes";
import { api, ApiError, timeAgo } from "@/lib/client";

// --- Candle -----------------------------------------------------------------

export function Candle({ placeId, stats, onStats }: { placeId: string; stats: PlaceStatsView | null; onStats(s: PlaceStatsView): void }) {
  const [lit, setLit] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function light() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ lit: boolean; stats: PlaceStatsView }>(`/api/places/${placeId}/candles`, { body: {} });
      setLit(true);
      onStats(res.stats);
      setMessage(res.lit ? "Your candle is lit. May your prayer rise with its light." : "Your candle is still burning.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "The candle couldn't be lit just now.");
    } finally {
      setBusy(false);
    }
  }

  // A small field of flames for candles lit today (decorative, capped).
  const others = Math.min(stats?.candlesToday ?? 0, 36);

  return (
    <section className="candle-area" aria-labelledby="candle-heading">
      <h2 id="candle-heading" className="visually-hidden">
        Light a candle
      </h2>
      <div className="candle-field" aria-hidden="true">
        {Array.from({ length: others }, (_, i) => (
          <span key={i} className="mini-flame" style={{ animationDelay: `${(i * 0.37) % 2.4}s`, left: `${(i * 37) % 100}%`, bottom: `${(i * 13) % 24}px` }} />
        ))}
      </div>

      <div className={`candle${lit ? " is-lit" : ""}`} aria-hidden="true">
        <div className="candle__glow" />
        <div className="candle__flame" />
        <div className="candle__wick" />
        <div className="candle__body" />
      </div>

      <p className="candle-count" aria-live="polite">
        {stats ? (
          <>
            <strong>{stats.candles.toLocaleString()}</strong> candle{stats.candles === 1 ? "" : "s"} lit here
            {stats.candlesToday > 0 && <> · {stats.candlesToday.toLocaleString()} today</>}
            <br />
            <strong>{stats.prayers.toLocaleString()}</strong> prayer{stats.prayers === 1 ? "" : "s"} offered
          </>
        ) : (
          " "
        )}
      </p>

      <button type="button" className="light-button" onClick={light} disabled={busy}>
        {lit ? "Your candle is burning" : busy ? "Lighting…" : "Light a candle"}
      </button>
      {message && (
        <p className="candle-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

// --- Prayer form --------------------------------------------------------------

export function PrayerForm({ placeId, onPosted }: { placeId: string; onPosted(): void }) {
  const { me } = useMe();
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await api<SubmitResult>(`/api/places/${placeId}/prayers`, {
        body: { text, isPublic, anonymous, name: name || me?.user?.displayName },
      });
      setResult(res);
      setText("");
      if (res.status === "published") onPosted();
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as SubmitResult | null) : null;
      setResult({ ok: false, message: err instanceof ApiError ? err.message : "Your prayer couldn't be sent.", selfHarm: data?.selfHarm });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="prayer-form-area" aria-labelledby="prayer-heading">
      <h2 id="prayer-heading">Offer a prayer</h2>
      <form className="prayer-form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="prayer-text">
          Your prayer
        </label>
        <textarea
          id="prayer-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={1000}
          placeholder="Write your prayer here…"
          required
        />
        <p className="char-count">{text.length} / 1000</p>

        <fieldset className="choice">
          <legend className="visually-hidden">Who can see this prayer</legend>
          <label className={!isPublic ? "is-on" : ""}>
            <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <span>
              <strong>Keep it private</strong>
              <small>Only you will see it.</small>
            </span>
          </label>
          <label className={isPublic ? "is-on" : ""}>
            <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
            <span>
              <strong>Share on the prayer wall</strong>
              <small>Others can pray with you.</small>
            </span>
          </label>
        </fieldset>

        {isPublic && (
          <div className="share-options">
            <label className="toggle">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Post anonymously
            </label>
            {!anonymous && (
              <label className="field">
                <span>Name to show</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={me?.user?.displayName ?? "First name"} />
              </label>
            )}
            <p className="hint">Shared prayers are checked before they appear, to keep this a safe and kind place.</p>
          </div>
        )}

        <button type="submit" className="light-button" disabled={busy || text.trim().length < 2}>
          {busy ? "Offering…" : "Offer prayer"}
        </button>
      </form>

      {result && (
        <div className={`prayer-result${result.ok ? "" : " is-error"}`} role="status">
          <p>{result.message}</p>
        </div>
      )}
      {result?.selfHarm && <SupportNote />}
    </section>
  );
}

/** Shown when a prayer suggests the author may be in danger. */
export function SupportNote() {
  return (
    <aside className="support-note">
      <p>
        <strong>You are not alone.</strong> If you are thinking about ending your life or hurting yourself, please reach out to someone now.
      </p>
      <p>
        Find a free, confidential helpline in your country at{" "}
        <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">
          findahelpline.com
        </a>
        . In the US you can call or text <strong>988</strong>. If you are in immediate danger, call your local emergency number.
      </p>
    </aside>
  );
}

// --- Prayer wall ----------------------------------------------------------------

export function PrayerWall({ placeId }: { placeId: string }) {
  const [prayers, setPrayers] = useState<WallPrayer[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      const res = await api<{ prayers: WallPrayer[]; nextCursor: string | null }>(
        `/api/places/${placeId}/prayers${before ? `?before=${encodeURIComponent(before)}` : ""}`,
      );
      setPrayers((prev) => (before && prev ? [...prev, ...res.prayers] : res.prayers));
      setCursor(res.nextCursor);
    },
    [placeId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data, sets state when it arrives
    load().catch(() => setPrayers([]));
  }, [load]);

  async function prayedFor(id: string) {
    setPrayers((list) => list?.map((p) => (p.id === id ? { ...p, prayedByMe: true, prayedCount: p.prayedCount + (p.prayedByMe ? 0 : 1) } : p)) ?? null);
    try {
      const res = await api<{ prayedCount: number }>(`/api/prayers/${id}/prayed`, { body: {} });
      setPrayers((list) => list?.map((p) => (p.id === id ? { ...p, prayedCount: res.prayedCount } : p)) ?? null);
    } catch {
      // leave the optimistic state; it will correct on next load
    }
  }

  return (
    <section className="wall" aria-labelledby="wall-heading">
      <h2 id="wall-heading">Prayer wall</h2>
      {prayers === null && <p className="muted">Gathering prayers…</p>}
      {prayers?.length === 0 && <p className="muted">No one has shared a prayer here yet. Yours could be the first.</p>}
      <ul className="wall__list">
        {prayers?.map((p) => (
          <li key={p.id} className="wall__item">
            <p className="wall__body">{p.body}</p>
            <p className="wall__meta">
              <span>
                {p.name ?? "Anonymous"} · {timeAgo(p.createdAt)}
              </span>
            </p>
            <div className="wall__actions">
              <button type="button" className={`pray-for${p.prayedByMe ? " is-on" : ""}`} onClick={() => prayedFor(p.id)} disabled={p.prayedByMe || p.mine}>
                <span aria-hidden="true">🙏</span> {p.prayedByMe ? "You prayed for this" : p.mine ? "Your prayer" : "I prayed for this"}
                {p.prayedCount > 0 && <span className="pray-for__count">{p.prayedCount}</span>}
              </button>
              {!p.mine && <SafetyMenu target={{ kind: "church_prayer", id: p.id }} onHidden={() => setPrayers((l) => l?.filter((x) => x.id !== p.id) ?? null)} />}
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type="button"
          className="secondary-button"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            await load(cursor).catch(() => {});
            setLoadingMore(false);
          }}
        >
          {loadingMore ? "Loading…" : "Show more prayers"}
        </button>
      )}
    </section>
  );
}
