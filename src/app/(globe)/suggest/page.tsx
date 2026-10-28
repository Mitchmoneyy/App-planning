import type { Metadata } from "next";
import SuggestPanel from "@/components/SuggestPanel";

export const metadata: Metadata = { title: "Add a place of worship · Global Sanctuary" };

export default function SuggestPage() {
  return <SuggestPanel />;
}
