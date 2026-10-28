/**
 * Faiths a person may optionally choose when sending a prayer or posting a
 * request, and short blessing templates from several traditions.
 *
 * Choosing a faith is always optional, and it's only shown publicly if the
 * person turns that on.
 */

export const FAITH_OPTIONS = [
  { key: "christian", label: "Christian" },
  { key: "muslim", label: "Muslim" },
  { key: "jewish", label: "Jewish" },
  { key: "hindu", label: "Hindu" },
  { key: "buddhist", label: "Buddhist" },
  { key: "sikh", label: "Sikh" },
  { key: "bahai", label: "Bahá'í" },
  { key: "other", label: "Other / spiritual" },
] as const;

export type FaithOption = (typeof FAITH_OPTIONS)[number]["key"];

export const isFaithOption = (v: unknown): v is FaithOption => FAITH_OPTIONS.some((f) => f.key === v);
export const faithOptionLabel = (key: string | null) => FAITH_OPTIONS.find((f) => f.key === key)?.label ?? null;

export interface Blessing {
  id: string;
  /** Tradition it comes from (shown as a small label). */
  tradition: string;
  /** {place} is replaced by the place name when sending to a place. */
  text: string;
}

export const BLESSINGS: Blessing[] = [
  { id: "peace", tradition: "For everyone", text: "May you be surrounded by peace, and may you know you are not alone." },
  { id: "strength", tradition: "For everyone", text: "Holding the people of {place} in my heart. Sending strength, comfort and hope." },
  { id: "priestly", tradition: "Jewish & Christian", text: "May the Lord bless you and keep you; may the Lord make His face shine upon you and give you peace." },
  { id: "salaam", tradition: "Muslim", text: "May Allah grant you ease, healing and peace, and keep you safe. Ameen." },
  { id: "metta", tradition: "Buddhist", text: "May you be well. May you be happy. May you be free from suffering." },
  { id: "shanti", tradition: "Hindu", text: "Sarve bhavantu sukhinah: may all beings be happy. Om shanti, shanti, shanti." },
  { id: "chardi-kala", tradition: "Sikh", text: "May Waheguru bless you with courage and chardi kala, ever-rising spirits." },
  { id: "refuah", tradition: "Jewish", text: "Wishing you refuah shleimah, a complete healing of body and spirit." },
  { id: "bahai", tradition: "Bahá'í", text: "May God's grace surround you and gladden your heart, and may your path be filled with light." },
  { id: "warm", tradition: "Not religious", text: "Thinking of you and sending warmth, strength and good wishes." },
];

export const blessingText = (id: string, place: string) => BLESSINGS.find((b) => b.id === id)?.text.replace("{place}", place) ?? null;
