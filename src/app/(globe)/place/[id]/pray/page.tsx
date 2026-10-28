import { redirect } from "next/navigation";
import { getAllPlaceIds } from "@/lib/places.server";

// The prayer space now lives inside the immersive view; keep old links working.
export function generateStaticParams() {
  return getAllPlaceIds().map((id) => ({ id }));
}

export default async function PrayRedirect({ params }: PageProps<"/place/[id]/pray">) {
  redirect(`/place/${(await params).id}?tab=pray`);
}
