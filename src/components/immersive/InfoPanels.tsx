"use client";

/** The info panels shown over the immersive view: About, Photos, Visit. */
import { useState } from "react";
import PhotoGallery from "../PhotoGallery";
import SuggestForm from "../SuggestForm";
import TravelEstimate from "../TravelEstimate";
import { etiquetteFor } from "@/lib/etiquette";
import { faithLabel } from "@/lib/faiths";
import type { Place } from "@/lib/types";
import type { PlaceInfo } from "@/server/wikimedia";

interface Props {
  place: Place;
  info: PlaceInfo | null;
  loading: boolean;
}

export function AboutPanel({ place, info, loading }: Props) {
  const wikiSearch = place.wikipedia ? `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(place.wikipedia)}` : null;
  return (
    <div className="ipanel__body">
      {loading && (
        <div className="skeleton" aria-label="Loading">
          <span />
          <span />
          <span style={{ width: "70%" }} />
        </div>
      )}
      {info?.description && <p className="lede">{info.description.charAt(0).toUpperCase() + info.description.slice(1)}</p>}
      {info?.summary && <p className="prose">{info.summary}</p>}
      {!loading && !info?.summary && (
        <div className="empty-invite">
          <p className="empty-invite__title">Every place of prayer has a story.</p>
          <p className="muted">
            We don&apos;t have this one&apos;s history or photos yet. If you know it, or worship here, you can help others discover it.
          </p>
          <p className="link-row">
            <a href="?tab=visit#suggest">Add details</a>
            {wikiSearch && (
              <a href={wikiSearch} target="_blank" rel="noopener noreferrer">
                Search Wikipedia
              </a>
            )}
          </p>
        </div>
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

      {info && info.sections.length > 0 && (
        <div className="history">
          <h3>History &amp; architecture</h3>
          {info.sections.map((s, i) => (
            <details key={s.heading} className="history-section" open={i === 0}>
              <summary>{s.heading}</summary>
              {s.text.split(/\n\n+/).map((para, j) => (
                <p key={j} className="prose">
                  {para}
                </p>
              ))}
            </details>
          ))}
        </div>
      )}

      {info?.available && <Attribution info={info} />}
    </div>
  );
}

export function PhotosPanel({ place, info, loading }: Props) {
  return (
    <div className="ipanel__body">
      {loading && <p className="muted">Gathering photos…</p>}
      {info && info.photos.length > 0 ? (
        <PhotoGallery photos={info.photos} placeName={place.name} layout="grid" />
      ) : (
        !loading && <p className="muted">No freely licensed photos found yet for this place.</p>
      )}
    </div>
  );
}

export function VisitPanel({ place, info }: Props) {
  const [copied, setCopied] = useState(false);
  const coords = `${place.lat.toFixed(6)},${place.lon.toFixed(6)}`;
  const website = info?.website ?? place.website;
  const address = place.address ?? info?.address ?? null;
  const where = [place.city, place.country].filter(Boolean).join(", ");
  const e = etiquetteFor(place.faith);
  const q = encodeURIComponent(place.name);

  return (
    <div className="ipanel__body">
      <dl className="facts">
        <div>
          <dt>Address</dt>
          <dd>{[address, where].filter(Boolean).join(", ") || "Not listed yet"}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>
            <code>{coords}</code>{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                navigator.clipboard?.writeText(coords).then(() => setCopied(true), () => {});
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </dd>
        </div>
        <div>
          <dt>Service times &amp; hours</dt>
          <dd>{website ? "Not listed yet. Check the official website before you go." : "Not listed yet. Please check locally, especially on holy days."}</dd>
        </div>
      </dl>

      <p className="link-row directions">
        <a className="secondary-button" href={`https://www.google.com/maps/dir/?api=1&destination=${coords}`} target="_blank" rel="noopener noreferrer">
          Google Maps directions
        </a>
        <a className="secondary-button" href={`https://maps.apple.com/?daddr=${coords}&q=${q}`} target="_blank" rel="noopener noreferrer">
          Apple Maps directions
        </a>
      </p>
      <p className="link-row">
        {website && (
          <a href={website} target="_blank" rel="noopener noreferrer">
            Official website
          </a>
        )}
        <a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}`} target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>
      </p>

      <section className="etiquette" aria-labelledby="etiquette-h">
        <h3 id="etiquette-h">Visiting respectfully</h3>
        <p className="hint">General guidance for visiting places of worship in this tradition ({faithLabel(place.faith)}). Customs vary; follow local signs and ask if unsure.</p>
        <dl className="facts">
          <div>
            <dt>Dress</dt>
            <dd>{e.dress}</dd>
          </div>
          {e.head && (
            <div>
              <dt>Head covering</dt>
              <dd>{e.head}</dd>
            </div>
          )}
          {e.shoes && (
            <div>
              <dt>Shoes</dt>
              <dd>{e.shoes}</dd>
            </div>
          )}
          <div>
            <dt>Photos</dt>
            <dd>{e.photos}</dd>
          </div>
        </dl>
        <ul className="etiquette__list">
          {e.conduct.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <TravelEstimate place={place} />

      <details className="suggest" id="suggest">
        <summary>Something wrong or missing? Suggest a correction</summary>
        <SuggestForm place={place} />
      </details>
    </div>
  );
}

function Attribution({ info }: { info: PlaceInfo }) {
  return (
    <p className="attribution">
      {info.wikipediaUrl && (
        <>
          Text from Wikipedia,{" "}
          <a href={info.wikipediaUrl} target="_blank" rel="noopener noreferrer">
            “{info.wikipediaTitle}”
          </a>{" "}
          (
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer license">
            CC BY-SA 4.0
          </a>
          ).{" "}
        </>
      )}
      {info.wikidataId && (
        <>
          Facts from{" "}
          <a href={`https://www.wikidata.org/wiki/${info.wikidataId}`} target="_blank" rel="noopener noreferrer">
            Wikidata
          </a>
          .{" "}
        </>
      )}
      {info.photos.length > 0 && "Photos from Wikimedia Commons, each credited."}
    </p>
  );
}
