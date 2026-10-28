"use client";

/**
 * The rich part of the detail page: photos, background, key facts,
 * history & architecture, and visitor info. Loaded from /api/places/:id/info
 * (Wikipedia, Wikidata and Commons, cached on the server).
 */
import { useEffect, useState } from "react";
import MiniMap from "./MiniMapLoader";
import PhotoGallery from "./PhotoGallery";
import { api } from "@/lib/client";
import { faithColor } from "@/lib/faiths";
import type { Place } from "@/lib/types";
import type { PlaceInfo } from "@/server/wikimedia";

export default function PlaceDetails({ place }: { place: Place }) {
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    api<PlaceInfo>(`/api/places/${place.id}/info`, { signal: ctrl.signal })
      .then(setInfo)
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [place.id]);

  const loading = !info && !failed;
  const coords = `${place.lat},${place.lon}`;
  const website = info?.website ?? place.website;
  const wikiSearch = place.wikipedia ? `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(place.wikipedia)}` : null;

  return (
    <>
      {info && info.photos.length > 0 && <PhotoGallery photos={info.photos} placeName={place.name} />}

      <section className="card" aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        {loading && <SkeletonLines />}
        {info?.description && <p className="lede">{capitalize(info.description)}</p>}
        {info?.summary && <p className="prose">{info.summary}</p>}
        {(failed || (info && !info.summary)) && (
          <p className="muted">We don&apos;t have a written background for this place yet.{wikiSearch && " You may find more on Wikipedia."}</p>
        )}

        {info && info.facts.length > 0 && (
          <dl className="facts">
            {info.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {info && info.sections.length > 0 && (
        <section className="card" aria-labelledby="history-heading">
          <h2 id="history-heading">History &amp; architecture</h2>
          {info.sections.map((s) => (
            <details key={s.heading} className="history-section" open={info.sections.length === 1}>
              <summary>{s.heading}</summary>
              {s.text.split(/\n\n+/).map((para, i) => (
                <p key={i} className="prose">
                  {para}
                </p>
              ))}
            </details>
          ))}
        </section>
      )}

      <section className="card" aria-labelledby="visit-heading">
        <h2 id="visit-heading">Visitor information</h2>
        <MiniMap lat={place.lat} lon={place.lon} color={faithColor(place.faith)} label={place.name} />
        <dl className="facts">
          {info?.address && (
            <div>
              <dt>Address</dt>
              <dd>{info.address}</dd>
            </div>
          )}
          <div>
            <dt>Location</dt>
            <dd>{[place.city, place.country].filter(Boolean).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>Service times &amp; hours</dt>
            <dd>
              Not listed yet.{" "}
              {website ? "Check the official website before you go." : "Please check locally before you go, especially on holy days."}
            </dd>
          </div>
        </dl>
        <p className="link-row">
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${coords}`} target="_blank" rel="noopener noreferrer">
            Get directions
          </a>
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer">
              Official website
            </a>
          )}
          <a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`} target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>
        </p>
      </section>

      {info?.available && (
        <p className="attribution">
          {info.wikipediaUrl && (
            <>
              Text from the Wikipedia article{" "}
              <a href={info.wikipediaUrl} target="_blank" rel="noopener noreferrer">
                “{info.wikipediaTitle}”
              </a>
              , available under{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer license">
                CC BY-SA 4.0
              </a>
              .{" "}
            </>
          )}
          {info.wikidataId && (
            <>
              Facts from{" "}
              <a href={`https://www.wikidata.org/wiki/${info.wikidataId}`} target="_blank" rel="noopener noreferrer">
                Wikidata
              </a>{" "}
              (CC0).{" "}
            </>
          )}
          {info.photos.length > 0 && "Photos from Wikimedia Commons; each photo lists its own author and license."}
        </p>
      )}
    </>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SkeletonLines() {
  return (
    <div className="skeleton" aria-label="Loading">
      <span />
      <span />
      <span style={{ width: "70%" }} />
    </div>
  );
}
