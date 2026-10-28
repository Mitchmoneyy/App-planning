"use client";

/** The info panels shown over the immersive view: About, Photos, Visit. */
import PhotoGallery from "../PhotoGallery";
import TravelEstimate from "../TravelEstimate";
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
        <p className="muted">
          We don&apos;t have a written background for this place yet.{" "}
          {wikiSearch && (
            <a href={wikiSearch} target="_blank" rel="noopener noreferrer">
              Search Wikipedia
            </a>
          )}
        </p>
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
  const coords = `${place.lat},${place.lon}`;
  const website = info?.website ?? place.website;
  return (
    <div className="ipanel__body">
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
          <dd>{website ? "Not listed yet. Check the official website before you go." : "Not listed yet. Please check locally, especially on holy days."}</dd>
        </div>
      </dl>
      <p className="link-row">
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${coords}`} target="_blank" rel="noopener noreferrer">
          Directions
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
      <TravelEstimate place={place} />
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
