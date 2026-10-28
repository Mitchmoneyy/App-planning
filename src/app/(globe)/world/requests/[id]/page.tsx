import type { Metadata } from "next";
import { Suspense } from "react";
import RequestPanel from "@/components/world/RequestPanel";

export const metadata: Metadata = { title: "Prayer request · Global Sanctuary", robots: { index: false } };

// Request ids are only known at request time, so the id is read inside Suspense.
export default function RequestPage({ params }: PageProps<"/world/requests/[id]">) {
  return (
    <Suspense>
      <RequestById params={params} />
    </Suspense>
  );
}

async function RequestById({ params }: { params: PageProps<"/world/requests/[id]">["params"] }) {
  return <RequestPanel id={(await params).id} />;
}
