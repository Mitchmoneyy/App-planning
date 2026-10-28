import type { Metadata } from "next";
import ModerationQueue from "@/components/ModerationQueue";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Moderation · Global Sanctuary", robots: { index: false } };

export default function AdminPage() {
  return (
    <>
      <SiteHeader />
      <main className="narrow-page">
        <ModerationQueue />
      </main>
    </>
  );
}
