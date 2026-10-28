"use client";

/** "My sanctuary": account, saved places and prayer history. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import BlockedList from "./me/BlockedList";
import WorldHistory from "./me/WorldHistory";
import WorldSettings from "./me/WorldSettings";
import { useMe } from "./MeProvider";
import { usePlacesById } from "@/hooks/usePlaces";
import type { OwnPrayer } from "@/lib/apiTypes";
import { api, timeAgo } from "@/lib/client";
import { faithColor, faithLabel } from "@/lib/faiths";

export default function MySanctuary() {
  const { me, loading, refresh, setFavorite } = useMe();
  const places = usePlacesById(me?.favorites ?? []);
  const router = useRouter();
  const [prayers, setPrayers] = useState<OwnPrayer[] | null>(null);

  const loadPrayers = useCallback(async () => {
    try {
      setPrayers((await api<{ prayers: OwnPrayer[] }>("/api/me/prayers")).prayers);
    } catch {
      setPrayers([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPrayers();
  }, [loadPrayers, me?.user?.id]);

  async function signOut() {
    await api("/api/auth/signout", { body: {} }).catch(() => {});
    await refresh();
    router.refresh();
  }

  async function deleteAccount() {
    if (!confirm("Delete your account? Your prayers, reviews and saved places will be permanently removed.")) return;
    await api("/api/me", { method: "DELETE", body: {} });
    await refresh();
  }

  async function deletePrayer(id: string) {
    if (!confirm("Remove this prayer? This can't be undone.")) return;
    await api(`/api/prayers/${id}`, { method: "DELETE", body: {} }).catch(() => {});
    setPrayers((list) => list?.filter((p) => p.id !== id) ?? null);
  }

  if (loading) return <p className="muted">Loading…</p>;

  const saved = (me?.favorites ?? []).map((id) => places?.get(id)).filter((p) => p !== undefined);

  return (
    <div className="stack-lg">
      <h1>My sanctuary</h1>

      <section className="card">
        {me?.user ? (
          <>
            <h2>Hello, {me.user.displayName}</h2>
            <p className="muted">Signed in as {me.user.email}</p>
            <p className="link-row">
              <button type="button" className="secondary-button" onClick={signOut}>
                Sign out
              </button>
              {me.user.isAdmin && (
                <Link href="/admin" className="secondary-button">
                  Moderation queue
                </Link>
              )}
            </p>
          </>
        ) : (
          <>
            <h2>You&apos;re praying anonymously</h2>
            <p className="muted">
              Your saved places and prayers are kept on this device. Create a free account to keep them safe and use them on other
              devices.
            </p>
            <p className="link-row">
              <Link href="/signin?mode=signup" className="primary-button">
                Create account
              </Link>
              <Link href="/signin" className="secondary-button">
                Sign in
              </Link>
            </p>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="saved-heading">
        <h2 id="saved-heading">Saved places</h2>
        {saved.length === 0 ? (
          <p className="muted">
            Nothing saved yet. Tap the heart on any place to keep it here. <Link href="/">Explore the globe</Link>.
          </p>
        ) : (
          <ul className="saved-list">
            {saved.map((p) => (
              <li key={p.id}>
                <span className="chip__dot" style={{ background: faithColor(p.faith) }} aria-hidden="true" />
                <span className="saved-list__text">
                  <Link href={`/place/${p.id}`}>{p.name}</Link>
                  <small className="muted">
                    {faithLabel(p.faith)} · {[p.city, p.country].filter(Boolean).join(", ")}
                  </small>
                </span>
                <Link href={`/place/${p.id}?tab=pray`} className="small-link">
                  Pray
                </Link>
                <button type="button" className="link-button" onClick={() => setFavorite(p.id, false)} aria-label={`Remove ${p.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="world-heading">
        <h2 id="world-heading">Prayers with the world</h2>
        <WorldHistory signedIn={Boolean(me?.user)} />
      </section>

      {me?.user && (
        <section className="card" id="notifications" aria-labelledby="notify-heading">
          <h2 id="notify-heading">Your area &amp; notifications</h2>
          <WorldSettings />
        </section>
      )}

      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">Prayers at places of worship</h2>
        {prayers === null && <p className="muted">Loading…</p>}
        {prayers?.length === 0 && <p className="muted">Prayers you offer, private or shared, will appear here. Only you can see this list.</p>}
        <ul className="own-prayers">
          {prayers?.map((p) => (
            <li key={p.id}>
              <p className="own-prayers__head">
                <Link href={`/place/${p.placeId}?tab=pray`}>{p.placeName}</Link>
                <span className={`status status--${p.status}`}>{p.statusLabel}</span>
              </p>
              <p className="prose">{p.body}</p>
              <p className="muted own-prayers__meta">
                {timeAgo(p.createdAt)}
                {p.prayedCount > 0 && ` · ${p.prayedCount} ${p.prayedCount === 1 ? "person" : "people"} prayed with you`}
                {" · "}
                <button type="button" className="link-button" onClick={() => deletePrayer(p.id)}>
                  Remove
                </button>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="blocked-heading">
        <h2 id="blocked-heading">Blocked</h2>
        <BlockedList />
      </section>

      {me?.user && (
        <section className="card danger-zone">
          <h2>Delete account</h2>
          <p className="muted">Permanently removes your account, prayers, reviews and saved places.</p>
          <button type="button" className="danger-button" onClick={deleteAccount}>
            Delete my account
          </button>
        </section>
      )}
    </div>
  );
}
