/**
 * A place of worship: the globe flies down to it, then the immersive view
 * opens (Street View / 3D / 360° / photos / map) with info and prayer panels.
 * Landmarks are pre-rendered; the other 1.5M+ places render on request,
 * looked up from the places tiles.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Immersive from "@/components/immersive/Immersive";
import { faithLabel } from "@/lib/faiths";
import { findPlace, getCuratedPlaceIds } from "@/lib/places.server";

export function generateStaticParams() {
  return getCuratedPlaceIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/place/[id]">): Promise<Metadata> {
  const place = await findPlace(decodeURIComponent((await params).id));
  if (!place) return {};
  const where = [place.city, place.country].filter(Boolean).join(", ");
  return {
    title: `${place.name} · Global Sanctuary`,
    description: `Visit ${place.name}${where ? ` in ${where}` : ""} from anywhere: look around, learn its history and pray. A ${faithLabel(place.faith)} place of worship.`,
  };
}

export default function PlacePage({ params }: PageProps<"/place/[id]">) {
  return (
    <Suspense>
      <PlaceById params={params} />
    </Suspense>
  );
}

async function PlaceById({ params }: { params: PageProps<"/place/[id]">["params"] }) {
  const place = await findPlace(decodeURIComponent((await params).id));
  if (!place) notFound();
  return <Immersive place={place} />;
}
