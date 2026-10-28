/**
 * Place detail page. The page shell (name, faith, location) is pre-rendered
 * for every place; history, photos, reviews and live counts load in the
 * browser from our API.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlaceActions from "@/components/PlaceActions";
import PlaceDetails from "@/components/PlaceDetails";
import Reviews from "@/components/Reviews";
import SiteHeader from "@/components/SiteHeader";
import TravelEstimate from "@/components/TravelEstimate";
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
    description: `${place.name}${where ? ` in ${where}` : ""}: history, photos, visitor information, and a space to pray there from anywhere.`,
  };
}

export default async function PlacePage({ params }: PageProps<"/place/[id]">) {
  const place = getPlace((await params).id);
  if (!place) notFound();

  const where = [place.city, place.country].filter(Boolean).join(", ");

  return (
    <>
      <SiteHeader />
      <main className="place-page">
        <a href={`/?place=${place.id}`} className="back-link">
          ← Back to the globe
        </a>

        <header className="place-page__header">
          <p className="faith-tag">
            <span className="chip__dot" style={{ background: faithColor(place.faith) }} aria-hidden="true" />
            {faithLabel(place.faith)}
            {place.tradition && place.tradition !== faithLabel(place.faith) && <> · {place.tradition}</>}
          </p>
          <h1>{place.name}</h1>
          {where && <p className="place-page__where">{where}</p>}
          {place.heritage && <p className="heritage-badge">UNESCO World Heritage</p>}
          <PlaceActions placeId={place.id} />
        </header>

        <PlaceDetails place={place} />
        <TravelEstimate place={place} />
        <Reviews place={place} />
      </main>
    </>
  );
}
