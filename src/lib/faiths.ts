/**
 * Faiths shown in filters and legends, with the marker color for each.
 * Keys must match scripts/lib/places-output.mjs.
 */
export const FAITHS = [
  { key: "christianity", label: "Christianity", color: "#5b8def" },
  { key: "islam", label: "Islam", color: "#2fa37b" },
  { key: "judaism", label: "Judaism", color: "#7b6cf6" },
  { key: "hinduism", label: "Hinduism", color: "#f08a3c" },
  { key: "buddhism", label: "Buddhism", color: "#e0b43c" },
  { key: "sikhism", label: "Sikhism", color: "#3a7bd5" },
  { key: "shinto", label: "Shinto", color: "#e05a4f" },
  { key: "jainism", label: "Jainism", color: "#c96bb7" },
  { key: "bahai", label: "Bahá'í Faith", color: "#3bb3c3" },
  { key: "chinese", label: "Taoism & Chinese traditions", color: "#b5613a" },
  { key: "zoroastrianism", label: "Zoroastrianism", color: "#d4763b" },
  { key: "other", label: "Other faiths", color: "#8f96a3" },
] as const;

export type FaithKey = (typeof FAITHS)[number]["key"];

const byKey = new Map<string, (typeof FAITHS)[number]>(FAITHS.map((f) => [f.key, f]));

export const faithLabel = (key: string) => byKey.get(key)?.label ?? "Other faiths";
export const faithColor = (key: string) => byKey.get(key)?.color ?? "#8f96a3";
