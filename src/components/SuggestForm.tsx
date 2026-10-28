"use client";

/**
 * Help improve the map: suggest a correction to a place (or report it closed
 * or duplicated), or add a missing place. Everything is reviewed by a
 * moderator before it changes the map.
 */
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { FAITHS } from "@/lib/faiths";
import type { Place } from "@/lib/types";

type Kind = "correction" | "closed" | "duplicate" | "new";

interface Props {
  /** Correcting an existing place. */
  place?: Place;
  /** Adding a new place at this spot. */
  spot?: { lat: number; lon: number } | null;
  onDone?(): void;
}

export default function SuggestForm({ place, spot, onDone }: Props) {
  const [kind, setKind] = useState<Kind>(place ? "correction" : "new");
  const [name, setName] = useState("");
  const [faith, setFaith] = useState<string>(place?.faith ?? "");
  const [tradition, setTradition] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ message: string }>("/api/suggestions", {
        body: {
          kind,
          placeId: place?.id ?? null,
          name: name || null,
          faith: faith || null,
          tradition: tradition || null,
          address: address || null,
          website: website || null,
          note: note || null,
          lat: kind === "new" ? (spot?.lat ?? null) : null,
          lon: kind === "new" ? (spot?.lon ?? null) : null,
        },
      });
      setResult({ ok: true, message: res.message });
      setNote("");
      onDone?.();
    } catch (err) {
      setResult({ ok: false, message: err instanceof ApiError ? err.message : "Couldn't send just now." });
    } finally {
      setBusy(false);
    }
  }

  if (result?.ok) {
    return (
      <p className="form-message" role="status">
        {result.message}
      </p>
    );
  }

  return (
    <form className="suggest-form stack" onSubmit={submit}>
      {place && (
        <div className="seg" role="radiogroup" aria-label="What would you like to tell us?">
          {(
            [
              ["correction", "Fix details"],
              ["closed", "It has closed"],
              ["duplicate", "It's a duplicate"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {(kind === "correction" || kind === "new") && (
        <>
          <label className="field">
            <span>{kind === "new" ? "Name of the place" : "Correct name (if different)"}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={140} required={kind === "new"} placeholder={place?.name} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Faith</span>
              <select value={faith} onChange={(e) => setFaith(e.target.value)} required={kind === "new"}>
                <option value="">Choose…</option>
                {FAITHS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Denomination or tradition (optional)</span>
              <input value={tradition} onChange={(e) => setTradition(e.target.value)} maxLength={80} placeholder={place?.tradition ?? "e.g. Sunni, Catholic, Theravada"} />
            </label>
          </div>
          <label className="field">
            <span>Address (optional)</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={240} placeholder={place?.address ?? undefined} />
          </label>
          <label className="field">
            <span>Website (optional)</span>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={300} placeholder="https://" />
          </label>
        </>
      )}

      <label className="field">
        <span>{kind === "duplicate" ? "Which place is it a duplicate of?" : kind === "closed" ? "Anything we should know? (optional)" : "Notes for the moderator (optional)"}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} required={kind === "duplicate"} />
      </label>

      {kind === "new" && !spot && <p className="hint">Click the globe to place the pin on the building.</p>}
      {kind === "new" && spot && (
        <p className="hint">
          Pin at {spot.lat.toFixed(5)}, {spot.lon.toFixed(5)}. Click the globe again to move it.
        </p>
      )}

      <button type="submit" className="primary-button" disabled={busy || (kind === "new" && !spot)}>
        {busy ? "Sending…" : "Send for review"}
      </button>
      <p className="hint">A moderator checks every suggestion before the map changes. Thank you for helping.</p>
      {result && !result.ok && (
        <p className="form-message is-error" role="alert">
          {result.message}
        </p>
      )}
    </form>
  );
}
