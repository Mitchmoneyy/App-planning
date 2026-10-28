import type { Metadata } from "next";
import AreaPanel from "@/components/world/AreaPanel";

export const metadata: Metadata = { title: "Prayers for your area · Global Sanctuary" };

export default function AreaPage() {
  return <AreaPanel />;
}
