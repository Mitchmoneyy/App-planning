"use client";

/** Prayers I've sent to places, my prayer requests, and prayers received for them. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { flag } from "../world/AreaPicker";
import type { RequestView, WorldPrayerView } from "@/lib/apiTypes";
import { api, timeAgo } from "@/lib/client";

interface Data {
  sent: (WorldPrayerView & { status: string })[];
  requests: RequestView[];
  received: WorldPrayerView[];
}

const where = (a: { kind: string; name: string; country: string }) => (a.kind === "city" ? `${a.name}, ${a.country}` : a.country);

export default function WorldHistory({ signedIn }: { signedIn: boolean }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    api<Data>("/api/me/world")
      .then(setData)
      .catch(() => setData({ sent: [], requests: [], received: [] }));
  }, [signedIn]);

  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <div>
        <h3 className="mini-title">Prayers you&apos;ve received ({data.received.length})</h3>
        {data.received.length === 0 ? (
          <p className="muted">
            {signedIn ? (
              <>
                When someone prays for one of your requests, it appears here. <Link href="/world?tab=requests">Ask for prayers</Link>.
              </>
            ) : (
              "Sign in to ask for prayers and see who prayed for you."
            )}
          </p>
        ) : (
          <ul className="history-list">
            {data.received.map((p) => (
              <li key={p.id}>
                <p className="history-list__head">
                  {p.origin ? (
                    <>
                      <span aria-hidden="true">{flag(p.origin.cc)}</span> Someone in {where(p.origin)}
                    </>
                  ) : (
                    "Someone"
                  )}{" "}
                  prayed for you · <span className="muted">{timeAgo(p.createdAt)}</span>
                </p>
                <p className="prose">{p.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.requests.length > 0 && (
        <div>
          <h3 className="mini-title">Your prayer requests</h3>
          <ul className="history-list">
            {data.requests.map((r) => (
              <li key={r.id}>
                <p className="history-list__head">
                  <Link href={`/world/requests/${r.id}`}>{where(r.area)}</Link>
                  <span className={`status status--${r.status === "published" ? (r.closed ? "private" : "published") : r.status}`}>
                    {r.status !== "published" ? "Waiting for review" : r.closed ? "Closed" : r.visibility === "public" ? "Open" : "Open · link only"}
                  </span>
                  <span className="muted">
                    {r.prayedCount} {r.prayedCount === 1 ? "person" : "people"} prayed
                  </span>
                </p>
                <p className="prose">{r.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mini-title">Prayers you&apos;ve sent to places ({data.sent.length})</h3>
        {data.sent.length === 0 ? (
          <p className="muted">
            <Link href="/world">Send a prayer or blessing</Link> to any city or country.
          </p>
        ) : (
          <ul className="history-list">
            {data.sent.map((p) => (
              <li key={p.id}>
                <p className="history-list__head">
                  To <span aria-hidden="true">{flag(p.target.cc)}</span> {where(p.target)} · <span className="muted">{timeAgo(p.createdAt)}</span>
                  {p.status !== "published" && <span className="status status--pending">{p.status === "pending" ? "Waiting for review" : "Hidden"}</span>}
                </p>
                <p className="prose">{p.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
