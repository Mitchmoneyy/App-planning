"use client";

/**
 * "Pray for the world": send a prayer to any place, pray for people who have
 * asked, and see prayers travelling. Open to every faith.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useGlobe } from "../globe/GlobeContext";
import Composer from "./Composer";
import RequestForm from "./RequestForm";
import { RequestCard, WorldPrayerItem } from "./WorldItems";
import type { RequestView, WorldPrayerView } from "@/lib/apiTypes";
import { api } from "@/lib/client";

type Tab = "send" | "requests" | "recent";

export default function WorldPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const { setShowRequests, stats } = useGlobe();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "send");
  const [asking, setAsking] = useState(false);
  const [posted, setPosted] = useState<RequestView | null>(null);
  const [listKey, setListKey] = useState(0);

  // Show open requests as lights on the globe while this panel is open.
  useEffect(() => {
    setShowRequests(true);
    return () => setShowRequests(false);
  }, [setShowRequests]);

  const go = (t: Tab) => {
    setTab(t);
    router.replace(`/world?tab=${t}`, { scroll: false });
  };

  return (
    <aside className="side-panel panel-glass" aria-label="Pray for the world">
      <header className="side-panel__head">
        <Link href="/" className="close-x" aria-label="Close">
          ×
        </Link>
        <p className="eyebrow">Open to every faith</p>
        <h1>Pray for the world</h1>
        <p className="muted">
          Send a prayer or blessing to people anywhere, or hold someone who has asked in your prayers.
          {stats && stats.total > 0 && ` ${stats.total.toLocaleString()} prayers sent so far.`}
        </p>
        <div className="tabs" role="tablist">
          {(
            [
              ["send", "Send a prayer"],
              ["requests", "Prayer requests"],
              ["recent", "Recent"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => go(key)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="side-panel__scroll">
        {tab === "send" && <Composer />}
        {tab === "requests" && (
          <>
            {posted && (
              <div className="notice" role="status">
                {posted.status === "published" ? (
                  <>Your request is shared. We&apos;ll let you know when someone prays for you. </>
                ) : (
                  <>Thank you. Your request will appear after a quick review. </>
                )}
                <Link href={`/world/requests/${posted.id}`}>View it</Link>
              </div>
            )}
            {asking ? (
              <RequestForm
                onPosted={(r) => {
                  setAsking(false);
                  setPosted(r);
                  setListKey((k) => k + 1);
                }}
              />
            ) : (
              <button type="button" className="secondary-button wide" onClick={() => setAsking(true)}>
                ✧ Ask others to pray for you
              </button>
            )}
            <RequestList key={listKey} />
          </>
        )}
        {tab === "recent" && <RecentList />}
      </div>
    </aside>
  );
}

function RequestList() {
  const [items, setItems] = useState<RequestView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    const res = await api<{ requests: RequestView[]; nextCursor: string | null }>(`/api/world/requests${before ? `?before=${encodeURIComponent(before)}` : ""}`);
    setItems((prev) => (before && prev ? [...prev, ...res.requests] : res.requests));
    setCursor(res.nextCursor);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load().catch(() => setItems([]));
  }, [load]);

  if (items === null) return <p className="muted">Gathering requests…</p>;
  if (items.length === 0) return <p className="muted">No open requests right now. Yours could be the first.</p>;
  return (
    <>
      <ul className="req-list">
        {items.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            onChange={(next) => setItems((list) => list?.map((x) => (x.id === next.id ? next : x)) ?? null)}
            onHidden={() => setItems((list) => list?.filter((x) => x.id !== r.id) ?? null)}
          />
        ))}
      </ul>
      {cursor && (
        <button type="button" className="secondary-button wide" onClick={() => load(cursor)}>
          Show more
        </button>
      )}
    </>
  );
}

function RecentList() {
  const [items, setItems] = useState<WorldPrayerView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    const res = await api<{ prayers: WorldPrayerView[]; nextCursor: string | null }>(`/api/world/prayers${before ? `?before=${encodeURIComponent(before)}` : ""}`);
    setItems((prev) => (before && prev ? [...prev, ...res.prayers] : res.prayers));
    setCursor(res.nextCursor);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load().catch(() => setItems([]));
  }, [load]);

  if (items === null) return <p className="muted">Gathering prayers…</p>;
  if (items.length === 0) return <p className="muted">No prayers yet. Send the first one.</p>;
  return (
    <>
      <ul className="wp-list">
        {items.map((p) => (
          <WorldPrayerItem key={p.id} prayer={p} onHidden={() => setItems((l) => l?.filter((x) => x.id !== p.id) ?? null)} />
        ))}
      </ul>
      {cursor && (
        <button type="button" className="secondary-button wide" onClick={() => load(cursor)}>
          Show more
        </button>
      )}
    </>
  );
}
