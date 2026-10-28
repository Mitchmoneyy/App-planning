"use client";

/** Visitor reviews: average rating, list, and a form for signed-in users. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "./MeProvider";
import type { ReviewView } from "@/lib/apiTypes";
import { api, ApiError, timeAgo } from "@/lib/client";
import type { Place } from "@/lib/types";

interface ReviewsResponse {
  summary: { count: number; average: number | null };
  reviews: ReviewView[];
  mine: ReviewView | null;
}

export default function Reviews({ place }: { place: Place }) {
  const { me } = useMe();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<ReviewsResponse>(`/api/places/${place.id}/reviews`));
    } catch {
      setData({ summary: { count: 0, average: null }, reviews: [], mine: null });
    }
  }, [place.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, me?.user?.id]);

  const query = encodeURIComponent(`${place.name} ${place.city ?? ""}`.trim());

  return (
    <section className="card" aria-labelledby="reviews-heading">
      <div className="card__header">
        <h2 id="reviews-heading">Reviews</h2>
        {data && data.summary.count > 0 && (
          <p className="rating-summary">
            <Stars value={data.summary.average ?? 0} /> {data.summary.average!.toFixed(1)}{" "}
            <span className="muted">
              ({data.summary.count} review{data.summary.count === 1 ? "" : "s"})
            </span>
          </p>
        )}
      </div>

      {data && data.reviews.length === 0 && <p className="muted">No reviews yet. Have you visited? Share what it was like.</p>}

      <ul className="review-list">
        {data?.reviews.map((r) => (
          <li key={r.id} className="review">
            <p className="review__head">
              <Stars value={r.rating} /> <strong>{r.name}</strong>
              {r.mine && <span className="tag">You</span>}
              <span className="muted"> · {timeAgo(r.updatedAt)}</span>
            </p>
            <p className="prose">{r.body}</p>
          </li>
        ))}
      </ul>

      {me?.user ? (
        editing || !data?.mine ? (
          <ReviewForm
            placeId={place.id}
            existing={data?.mine ?? null}
            onDone={() => {
              setEditing(false);
              load();
            }}
          />
        ) : (
          <div className="notice">
            {data.mine.status === "published" ? "You reviewed this place." : "Your review is waiting for a quick check before it appears."}{" "}
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Edit your review
            </button>
          </div>
        )
      ) : (
        <p className="notice">
          <Link href={`/signin?next=/place/${place.id}`}>Sign in</Link> to write a review.
        </p>
      )}

      <p className="link-row external-reviews">
        <span className="muted">More reviews:</span>
        <a href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noopener noreferrer">
          Google Maps
        </a>
        <a href={`https://www.tripadvisor.com/Search?q=${query}`} target="_blank" rel="noopener noreferrer">
          Tripadvisor
        </a>
      </p>
    </section>
  );
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {"★★★★★".slice(0, full)}
      <span className="stars__empty">{"★★★★★".slice(full)}</span>
    </span>
  );
}

function ReviewForm({ placeId, existing, onDone }: { placeId: string; existing: ReviewView | null; onDone(): void }) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setMessage("Please choose a star rating.");
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ message: string }>(`/api/places/${placeId}/reviews`, { body: { rating, text } });
      setMessage(res.message);
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete your review?")) return;
    await api(`/api/places/${placeId}/reviews`, { method: "DELETE", body: {} }).catch(() => {});
    onDone();
  }

  return (
    <form className="review-form" onSubmit={submit}>
      <fieldset className="star-input">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={n <= rating ? "is-on" : ""}>
            <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
            <span aria-hidden="true">★</span>
            <span className="visually-hidden">
              {n} star{n > 1 ? "s" : ""}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Your review</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} placeholder="What was your visit like?" required />
      </label>
      {message && <p className="form-message">{message}</p>}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Posting…" : existing ? "Update review" : "Post review"}
        </button>
        {existing && (
          <button type="button" className="link-button" onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
