"use client";

/**
 * "⋯" menu on anything someone else wrote: report it, or block the person
 * (their prayers and requests disappear for you, and they can't notify you).
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

export type SafetyTarget =
  | { kind: "church_prayer"; id: string }
  | { kind: "world_prayer"; id: string }
  | { kind: "request"; id: string };

const REASONS = [
  ["hateful", "Hateful or disrespectful"],
  ["faith-attack", "Mocks or attacks someone's faith"],
  ["harassment", "Harassment or threats"],
  ["personal-info", "Shares someone's private information"],
  ["spam", "Spam or advertising"],
  ["inappropriate", "Sexual or otherwise inappropriate"],
  ["other", "Something else"],
] as const;

export default function SafetyMenu({ target, onHidden }: { target: SafetyTarget; onHidden(): void }) {
  const [open, setOpen] = useState<"menu" | "report" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function report(reason: string) {
    // The church prayer wall predates the generic endpoint and keeps its own route.
    const url = target.kind === "church_prayer" ? `/api/prayers/${target.id}/report` : "/api/world/report";
    await api(url, { body: target.kind === "church_prayer" ? { reason: reason === "faith-attack" ? "hateful" : reason } : { kind: target.kind, id: target.id, reason } }).catch(() => {});
    setOpen(null);
    setDone("Thank you. We'll take a look.");
    setTimeout(onHidden, 1400);
  }

  async function block() {
    if (!confirm("Block this person? You won't see their prayers or requests, and they won't be able to notify you.")) return;
    await api("/api/blocks", { body: { kind: target.kind, id: target.id } }).catch(() => {});
    setOpen(null);
    setDone("Blocked. You can undo this in My sanctuary.");
    setTimeout(onHidden, 1400);
  }

  if (done) return <span className="safety__done">{done}</span>;

  return (
    <div className="safety" ref={box}>
      <button type="button" className="safety__toggle" onClick={() => setOpen(open ? null : "menu")} aria-expanded={open !== null} aria-label="More options">
        ⋯
      </button>
      {open === "menu" && (
        <ul className="safety__menu">
          <li>
            <button type="button" onClick={() => setOpen("report")}>
              Report…
            </button>
          </li>
          <li>
            <button type="button" onClick={block}>
              Block this person
            </button>
          </li>
        </ul>
      )}
      {open === "report" && (
        <ul className="safety__menu">
          <li className="safety__title">Why are you reporting this?</li>
          {REASONS.map(([value, label]) => (
            <li key={value}>
              <button type="button" onClick={() => report(value)}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
