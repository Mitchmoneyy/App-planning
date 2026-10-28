"use client";

/** Moderators (ADMIN_EMAILS) approve or remove held and reported content. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "./MeProvider";
import { api, ApiError, timeAgo } from "@/lib/client";

interface QueueItem {
  id: string;
  placeId: string | null;
  placeName: string;
  body: string;
  status: string;
  note: string | null;
  createdAt: string;
  reports?: number;
  rating?: number;
  name?: string;
}

export default function ModerationQueue() {
  const { me, loading } = useMe();
  const [queue, setQueue] = useState<{ prayers: QueueItem[]; reviews: QueueItem[]; worldPrayers: QueueItem[]; requests: QueueItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue(await api("/api/admin/queue"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the queue.");
    }
  }, []);

  useEffect(() => {
    if (me?.user?.isAdmin) load();
  }, [me, load]);

  type Kind = "prayer" | "review" | "world_prayer" | "request";
  async function act(kind: Kind, id: string, action: "approve" | "remove") {
    await api("/api/admin/moderate", { body: { kind, id, action } });
    load();
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!me?.user?.isAdmin) {
    return (
      <p className="notice">
        This page is for moderators. <Link href="/signin?next=/admin">Sign in</Link> with a moderator account (listed in ADMIN_EMAILS).
      </p>
    );
  }
  if (error) return <p className="form-message is-error">{error}</p>;
  if (!queue) return <p className="muted">Loading…</p>;

  const section = (kind: Kind, items: QueueItem[], title: string) => (
    <section className="card">
      <h2>
        {title} ({items.length})
      </h2>
      {items.length === 0 && <p className="muted">Nothing waiting. 🌿</p>}
      <ul className="queue">
        {items.map((item) => (
          <li key={item.id}>
            <p className="queue__meta">
              {item.placeId ? <Link href={`/place/${item.placeId}`}>{item.placeName}</Link> : <strong>{item.placeName}</strong>} · <span className={`status status--${item.status}`}>{item.status}</span>
              {item.reports ? ` · ${item.reports} reports` : ""}
              {item.rating ? ` · ${item.rating}★ by ${item.name}` : ""} · {timeAgo(item.createdAt)}
            </p>
            <p className="prose">{item.body}</p>
            {item.note && <p className="hint">Note: {item.note}</p>}
            <p className="link-row">
              <button type="button" className="secondary-button" onClick={() => act(kind, item.id, "approve")}>
                Approve &amp; publish
              </button>
              <button type="button" className="danger-button" onClick={() => act(kind, item.id, "remove")}>
                Remove
              </button>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="stack-lg">
      <h1>Moderation queue</h1>
      <p className="muted">Held by the automatic check, or hidden after reports. Possible self-harm notes deserve a gentle eye.</p>
      {section("world_prayer", queue.worldPrayers, "Prayers for places")}
      {section("request", queue.requests, "Prayer requests")}
      {section("prayer", queue.prayers, "Prayers at places of worship")}
      {section("review", queue.reviews, "Reviews")}
    </div>
  );
}
