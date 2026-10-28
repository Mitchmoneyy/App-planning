import type { Metadata } from "next";
import MySanctuary from "@/components/MySanctuary";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "My sanctuary · Global Sanctuary" };

export default function MePage() {
  return (
    <>
      <SiteHeader />
      <main className="narrow-page">
        <MySanctuary />
      </main>
    </>
  );
}
