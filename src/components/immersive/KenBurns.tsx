"use client";

/** Full-screen photo slideshow with slow pan and zoom, cross-fading every few seconds. */
import { useEffect, useState } from "react";
import type { Photo } from "@/server/wikimedia";

const SLIDE_MS = 9000;
// Each slide drifts in a different direction.
const MOVES = ["kb-a", "kb-b", "kb-c", "kb-d"];

export default function KenBurns({ photos, onIndex }: { photos: Photo[]; onIndex?(i: number): void }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photos.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % photos.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [photos.length]);

  useEffect(() => {
    onIndex?.(index);
  }, [index, onIndex]);

  return (
    <div className="kenburns" aria-hidden="true">
      {photos.map((p, i) => {
        // Only keep the current and neighbouring slides in the DOM.
        const near = i === index || i === (index + 1) % photos.length || i === (index - 1 + photos.length) % photos.length;
        if (!near) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- Commons serves sized images
          <img key={p.sourceUrl} src={p.url} alt="" className={`kenburns__slide ${MOVES[i % MOVES.length]}${i === index ? " is-on" : ""}`} />
        );
      })}
    </div>
  );
}
