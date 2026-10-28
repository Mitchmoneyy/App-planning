import { redirect } from "next/navigation";
import { getCuratedPlaceIds } from "@/lib/places.server";

// The prayer space now lives inside the immersive view; keep old links working.
export function generateStaticParams() {
  return getCuratedPlaceIds().map((id) => ({ id }));
}

export default async function PrayRedirect({ params }: PageProps<"/place/[id]/pray">) {
  redirect(`/place/${(await params).id}?tab=pray`);
}
