/**
 * Place detail page (Phase 1: the basics).
 * Phase 2 adds history from Wikipedia/Wikidata, photos and visitor info;
 * Phase 3 adds the prayer space.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MiniMap from "@/components/MiniMapLoader";
import { faithColor, faithLabel } from "@/lib/faiths";
import { getAllPlaceIds, getPlace } from "@/lib/places.server";

// Every place in the dataset is pre-rendered at build time; unknown ids 404 (see notFound below).
export function generateStaticParams() {
  return getAllPlaceIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/place/[id]">): Promise<Metadata> {
  const place = getPlace((await params).id);
  if (!place) return {};
  const where = [place.city, place.country].filter(Boolean).join(", ");
  return {
    title: `${place.name} · Global Sanctuary`,
    description: `${place.name}${where ? ` in ${where}` : ""}: a ${faithLabel(place.faith)} place of worship. Explore it on the Global Sanctuary globe.`,
  };
}

export default async function PlacePage({ params }: PageProps<"/place/[id]">) {
  const place = getPlace((await params).id);
  if (!place) notFound();

  const where = [place.city, place.country].filter(Boolean).join(", ");
  const coords = `${place.lat},${place.lon}`;
  // Search URL lands on the exact article when the title matches, or on search results if not.
  const wikipediaUrl = place.wikipedia ? `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(place.wikipedia)}` : null;

  return (
    <main className="place-page">
      <nav className="place-page__nav">
        <Link href={`/?place=${place.id}`} className="back-link">
          ← Back to the globe
        </Link>
      </nav>

      <header className="place-page__header">
        <p className="faith-tag">
          <span className="chip__dot" style={{ background: faithColor(place.faith) }} aria-hidden="true" />
          {faithLabel(place.faith)}
          {place.tradition && place.tradition !== faithLabel(place.faith) && <> · {place.tradition}</>}
        </p>
        <h1>{place.name}</h1>
        {where && <p className="place-page__where">{where}</p>}
        {place.heritage && <p className="heritage-badge">UNESCO World Heritage</p>}
      </header>

      <MiniMap lat={place.lat} lon={place.lon} color={faithColor(place.faith)} label={place.name} />

      <section className="place-page__section">
        <h2>Visit</h2>
        <ul className="link-list">
          <li>
            <a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${coords.replace(",", "/")}`} target="_blank" rel="noopener noreferrer">
              View on OpenStreetMap
            </a>
          </li>
          <li>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${coords}`} target="_blank" rel="noopener noreferrer">
              Get directions
            </a>
          </li>
          {place.website && (
            <li>
              <a href={place.website} target="_blank" rel="noopener noreferrer">
                Official website
              </a>
            </li>
          )}
          {wikipediaUrl && (
            <li>
              <a href={wikipediaUrl} target="_blank" rel="noopener noreferrer">
                Read about it on Wikipedia
              </a>
            </li>
          )}
        </ul>
        <p className="hint">
          Coordinates: {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
        </p>
      </section>
    </main>
  );
}
