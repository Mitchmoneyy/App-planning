import { Suspense } from "react";
import GlobeShell from "@/components/globe/GlobeShell";

/**
 * Everything in this group shares one globe that stays mounted between screens.
 * (Suspense: the shell reads the current URL, which some routes only know at request time.)
 */
export default function GlobeLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense>
      <GlobeShell>{children}</GlobeShell>
    </Suspense>
  );
}
