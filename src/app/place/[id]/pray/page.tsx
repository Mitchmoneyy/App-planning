/** The prayer space for one place. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrayerSpace from "@/components/PrayerSpace";
import SiteHeader from "@/components/SiteHeader";
import { getAllPlaceIds, getPlace } from "@/lib/places.server";

export function generateStaticParams() {
  return getAllPlaceIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/place/[id]/pray">): Promise<Metadata> {
  const place = getPlace((await params).id);
  if (!place) return {};
  return {
    title: `Pray at ${place.name} · Global Sanctuary`,
    description: `Light a candle and offer a prayer at ${place.name}, from wherever you are.`,
  };
}

export default async function PrayPage({ params }: PageProps<"/place/[id]/pray">) {
  const place = getPlace((await params).id);
  if (!place) notFound();
  return (
    <div className="pray-page">
      <SiteHeader dark />
      <main>
        <PrayerSpace place={place} />
      </main>
    </div>
  );
}
