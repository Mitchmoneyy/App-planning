import type { Metadata } from "next";
import { Suspense } from "react";
import WorldPanel from "@/components/world/WorldPanel";

export const metadata: Metadata = {
  title: "Pray for the world · Global Sanctuary",
  description: "Send a prayer or blessing to any city or country, and pray for people who have asked. Open to every faith.",
};

export default function WorldPage() {
  return (
    <Suspense>
      <WorldPanel />
    </Suspense>
  );
}
