"use client";

/**
 * The devotional gesture at a place: candle, diya, flowers, incense, butter
 * lamp, ema, prayer note, dua or a simple prayer, depending on its tradition
 * (see src/lib/gestures.ts). Each has a quiet animation and a live count.
 */
import "./offering.css";
import { useState } from "react";
import type { PlaceStatsView } from "@/lib/apiTypes";
import { api, ApiError } from "@/lib/client";
import { gesturesFor, type Gesture, type GestureKind } from "@/lib/gestures";

interface Props {
  placeId: string;
  faith: string;
  tradition: string | null;
  stats: PlaceStatsView | null;
  onStats(s: PlaceStatsView): void;
}

export default function Offering({ placeId, faith, tradition, stats, onStats }: Props) {
  const gestures = gesturesFor(faith, tradition);
  const [chosen, setChosen] = useState<Gesture>(gestures[0]);
  const [done, setDone] = useState<GestureKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function offer() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ lit: boolean; stats: PlaceStatsView }>(`/api/places/${encodeURIComponent(placeId)}/candles`, { body: { kind: chosen.kind } });
      setDone(chosen.kind);
      onStats(res.stats);
      setMessage(res.lit ? chosen.done : "Your offering is still here. You can return in a few minutes.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "That didn't go through just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const active = done === chosen.kind;
  const others = Math.min(stats?.candlesToday ?? 0, 30);

  return (
    <section className="offering" aria-labelledby="offering-heading">
      <h2 id="offering-heading" className="visually-hidden">
        {chosen.action}
      </h2>

      {gestures.length > 1 && (
        <div className="seg offering__choices" role="radiogroup" aria-label="Choose an offering">
          {gestures.map((g) => (
            <button key={g.kind} type="button" role="radio" aria-checked={g.kind === chosen.kind} className={g.kind === chosen.kind ? "is-on" : ""} onClick={() => setChosen(g)}>
              {g.action}
            </button>
          ))}
        </div>
      )}

      <div className={`offering__stage is-${chosen.kind}${active ? " is-done" : ""}`} aria-hidden="true">
        <div className="offering__others">
          {Array.from({ length: others }, (_, i) => (
            <span key={i} style={{ left: `${(i * 37) % 100}%`, bottom: `${(i * 13) % 26}px`, animationDelay: `${(i * 0.37) % 2.4}s` }} />
          ))}
        </div>
        <Art kind={chosen.kind} />
      </div>

      <p className="offering__about">{chosen.about}</p>

      <p className="candle-count" aria-live="polite">
        {stats ? (
          <>
            <strong>{stats.candles.toLocaleString()}</strong> offering{stats.candles === 1 ? "" : "s"} here
            {stats.candlesToday > 0 && <> · {stats.candlesToday.toLocaleString()} today</>}
            <br />
            <strong>{stats.prayers.toLocaleString()}</strong> written prayer{stats.prayers === 1 ? "" : "s"}
          </>
        ) : (
          " "
        )}
      </p>

      <button type="button" className="light-button" onClick={offer} disabled={busy || active}>
        {active ? "Offered with love" : busy ? "…" : chosen.action}
      </button>
      {message && (
        <p className="candle-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function Flame() {
  return (
    <g className="flame">
      <ellipse className="flame__glow" cx="60" cy="40" rx="34" ry="34" />
      <path className="flame__outer" d="M60 18c8 10 11 18 8 26-2 5-5 7-8 7s-6-2-8-7c-3-8 0-16 8-26z" />
      <path className="flame__inner" d="M60 32c3 4 4 8 2 12-1 2-2 3-2 3s-1-1-2-3c-2-4-1-8 2-12z" />
    </g>
  );
}

function Art({ kind }: { kind: GestureKind }) {
  switch (kind) {
    case "candle":
      return (
        <div className="candle is-lit">
          <div className="candle__glow" />
          <div className="candle__flame" />
          <div className="candle__wick" />
          <div className="candle__body" />
        </div>
      );
    case "diya":
      return (
        <svg viewBox="0 0 120 110" className="art">
          <Flame />
          <path className="clay" d="M18 66c10 24 74 24 84 0-14 6-70 6-84 0z" />
          <path className="clay clay--rim" d="M18 66c14 6 70 6 84 0l8-6c-6 3-14 4-20 4H30c-6 0-14-1-20-4z" />
          <path className="clay" d="M48 86h24l-4 12H52z" />
        </svg>
      );
    case "butter-lamp":
      return (
        <svg viewBox="0 0 120 110" className="art">
          <Flame />
          <path className="brass" d="M36 54h48l-6 22H42z" />
          <path className="brass" d="M54 76h12v14H54z" />
          <path className="brass" d="M40 96c8-6 32-6 40 0z" />
        </svg>
      );
    case "incense":
      return (
        <svg viewBox="0 0 120 110" className="art">
          <g className="smoke">
            <path d="M60 36c-8-8 8-14 0-22s6-12 2-16" />
            <path d="M64 38c6-9-6-14 2-22" />
          </g>
          <circle className="ember" cx="60" cy="40" r="2.6" />
          <path className="stick" d="M59 40h2v44h-2z" />
          <path className="brass" d="M34 84h52l-5 16H39z" />
        </svg>
      );
    case "flowers":
      return (
        <svg viewBox="0 0 120 110" className="art">
          {[30, 60, 90].map((x, i) => (
            <g key={x} className="bloom" style={{ animationDelay: `${i * 0.25}s` }} transform={`translate(${x} ${70 - (i % 2) * 8})`}>
              {Array.from({ length: 8 }, (_, k) => (
                <ellipse key={k} className="petal" cx="0" cy="-10" rx="5" ry="10" transform={`rotate(${k * 45})`} />
              ))}
              <circle className="bloom__heart" r="5" />
            </g>
          ))}
          <path className="leaf" d="M12 98c30-10 66-10 96 0z" />
        </svg>
      );
    case "ema":
      return (
        <svg viewBox="0 0 120 110" className="art">
          <path className="cord" d="M60 6v18" />
          <g className="ema">
            <path className="wood" d="M24 44 60 22l36 22v46H24z" />
            <path className="ink" d="M40 56h40M40 66h32M40 76h36" />
          </g>
        </svg>
      );
    case "note":
      return (
        <svg viewBox="0 0 120 110" className="art">
          <path className="stone" d="M10 30h100v70H10z" />
          <path className="stone-line" d="M10 52h100M10 76h100M44 30v22M84 52v24M30 76v24M72 76v24" />
          <g className="note">
            <path className="paper" d="M54 58l18-6 4 12-18 6z" />
          </g>
        </svg>
      );
    case "dua":
      return (
        <svg viewBox="0 0 120 110" className="art">
          <ellipse className="soft-light" cx="60" cy="40" rx="40" ry="34" />
          <path className="hand" d="M28 90c-4-18-6-34-2-46 2-6 8-6 9 0l2 16 2-26c1-6 8-6 8 0l1 26 4-20c1-6 8-5 8 1l-3 30c-1 10-6 16-6 22z" />
          <path className="hand" d="M92 90c4-18 6-34 2-46-2-6-8-6-9 0l-2 16-2-26c-1-6-8-6-8 0l-1 26-4-20c-1-6-8-5-8 1l3 30c1 10 6 16 6 22z" />
        </svg>
      );
    default: // prayer, ardas
      return (
        <svg viewBox="0 0 120 110" className="art">
          <ellipse className="soft-light" cx="60" cy="52" rx="44" ry="40" />
          <circle className="orb" cx="60" cy="52" r="14" />
        </svg>
      );
  }
}
