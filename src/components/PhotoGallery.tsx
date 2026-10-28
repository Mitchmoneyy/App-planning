"use client";

/** Photo strip with a full-screen viewer. Every photo shows its author and license. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo } from "@/server/wikimedia";

export default function PhotoGallery({ photos, placeName }: { photos: Photo[]; placeName: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const step = useCallback((delta: number) => setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length)), [photos.length]);

  if (!photos.length) return null;
  const current = open !== null ? photos[open] : null;

  return (
    <section className="gallery" aria-label={`Photos of ${placeName}`}>
      <div className="gallery__strip">
        {photos.map((p, i) => (
          <button key={p.sourceUrl} type="button" className="gallery__thumb" onClick={() => setOpen(i)} aria-label={`Open photo: ${p.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Commons serves pre-sized thumbnails */}
            <img src={p.thumbUrl} alt={p.description ?? p.title} loading={i < 3 ? "eager" : "lazy"} width={400} height={Math.round((400 * p.height) / p.width)} />
          </button>
        ))}
      </div>
      <p className="gallery__credit">Photos from Wikimedia Commons. Tap a photo for its author and license.</p>

      <dialog
        ref={dialogRef}
        className="lightbox"
        onClose={() => setOpen(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(null); // click on the backdrop
        }}
      >
        {current && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={current.description ?? current.title} />
            <figcaption>
              <strong>{current.title}</strong>
              {current.description && <span className="lightbox__desc">{current.description}</span>}
              <span>
                {current.author ? `By ${current.author}` : "Author unknown"}
                {current.license && (
                  <>
                    {" · "}
                    {current.licenseUrl ? (
                      <a href={current.licenseUrl} target="_blank" rel="noopener noreferrer license">
                        {current.license}
                      </a>
                    ) : (
                      current.license
                    )}
                  </>
                )}
                {" · "}
                <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer">
                  Source
                </a>
              </span>
            </figcaption>
            <div className="lightbox__controls">
              {photos.length > 1 && (
                <button type="button" onClick={() => step(-1)} aria-label="Previous photo">
                  ‹
                </button>
              )}
              <span>
                {open! + 1} / {photos.length}
              </span>
              {photos.length > 1 && (
                <button type="button" onClick={() => step(1)} aria-label="Next photo">
                  ›
                </button>
              )}
              <button type="button" onClick={() => setOpen(null)} aria-label="Close">
                ×
              </button>
            </div>
          </figure>
        )}
      </dialog>
    </section>
  );
}
