/**
 * A place of worship: the globe flies down to it, then the immersive view
 * opens (Street View / 360° / photos / map) with info and prayer panels.
 * Pre-rendered for every place so links and search engines work.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Immersive from "@/components/immersive/Immersive";
import { faithLabel } from "@/lib/faiths";
import { getAllPlaceIds, getPlace } from "@/lib/places.server";

export function generateStaticParams() {
  return getAllPlaceIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/place/[id]">): Promise<Metadata> {
  const place = getPlace((await params).id);
  if (!place) return {};
  const where = [place.city, place.country].filter(Boolean).join(", ");
  return {
    title: `${place.name} · Global Sanctuary`,
    description: `Visit ${place.name}${where ? ` in ${where}` : ""} from anywhere: look around, learn its history, light a candle and pray. A ${faithLabel(place.faith)} place of worship.`,
  };
}

export default async function PlacePage({ params }: PageProps<"/place/[id]">) {
  const place = getPlace((await params).id);
  if (!place) notFound();
  return (
    <Suspense>
      <Immersive place={place} />
    </Suspense>
  );
}
