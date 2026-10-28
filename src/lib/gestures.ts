/**
 * Devotional gestures offered in each place's prayer space, chosen to match
 * what people of that tradition actually do, and to avoid what they don't:
 *
 * - No candles, lamps or incense for Muslims (dua with raised hands), Sikhs
 *   (Ardas; Sikh teaching discourages ritual lamps) or Zoroastrians (fire is
 *   sacred and tended by priests).
 * - Votive candles for Catholic, Orthodox, Anglican and Lutheran churches; a
 *   simple prayer for most Protestant churches, which don't use them.
 * - Diya and flowers for Hindu and Jain temples; incense and flowers (butter
 *   lamps in Tibetan practice) for Buddhists; incense for Chinese temples; an
 *   ema plaque at Shinto shrines; a written prayer note in Jewish tradition.
 *
 * Everyone can always simply pray. Community review before launch is
 * recommended; wording is kept plain and invitational.
 */
import type { FaithKey } from "./faiths";

export type GestureKind = "candle" | "prayer" | "dua" | "diya" | "flowers" | "incense" | "butter-lamp" | "ema" | "note" | "ardas";

export interface Gesture {
  kind: GestureKind;
  /** Button: "Light a candle" */
  action: string;
  /** After: "Your candle is burning." */
  done: string;
  /** Count label: "candles lit" */
  counted: string;
  /** One line explaining the custom, shown as a hint. */
  about: string;
}

export const GESTURES: Record<GestureKind, Gesture> = {
  candle: { kind: "candle", action: "Light a candle", done: "Your candle is lit. May your prayer rise with its light.", counted: "candles lit", about: "Lighting a votive candle is a centuries-old way to accompany a prayer." },
  prayer: { kind: "prayer", action: "I prayed here", done: "Thank you for praying. Your prayer has joined many others here.", counted: "prayers offered", about: "A quiet moment of prayer, in your own words or in silence." },
  dua: { kind: "dua", action: "Make dua", done: "May your dua be accepted. Āmīn.", counted: "duas made", about: "Dua is personal supplication to God, often with hands raised, palms open." },
  diya: { kind: "diya", action: "Light a diya", done: "Your diya is lit. May its light remove darkness.", counted: "diyas lit", about: "A diya, a small oil lamp, is offered in worship as a sign of light over darkness." },
  flowers: { kind: "flowers", action: "Offer flowers", done: "Your flowers have been offered with devotion.", counted: "flower offerings", about: "Fresh flowers are offered as a sign of devotion and the beauty of life." },
  incense: { kind: "incense", action: "Offer incense", done: "Your incense is offered. May your prayer rise with its fragrance.", counted: "incense offerings", about: "Incense is offered with a bow, its fragrance carrying respect and prayer." },
  "butter-lamp": { kind: "butter-lamp", action: "Light a butter lamp", done: "Your butter lamp is lit, dispelling the darkness of ignorance.", counted: "butter lamps lit", about: "In Tibetan practice, butter lamps are offered for wisdom and for all beings." },
  ema: { kind: "ema", action: "Hang an ema", done: "Your ema has been hung with your wish.", counted: "ema hung", about: "Ema are small wooden plaques on which visitors write prayers and wishes for the kami." },
  note: { kind: "note", action: "Leave a prayer", done: "Your prayer has been left here.", counted: "prayers left", about: "Placing a written prayer is a cherished custom, best known at the Western Wall." },
  ardas: { kind: "ardas", action: "Join in Ardas", done: "Waheguru. Your prayer has joined the sangat's.", counted: "prayers joined", about: "Ardas is the Sikh prayer of remembrance and petition, offered standing with folded hands." },
};

const LITURGICAL = /catholic|orthodox|anglican|episcopal|lutheran|coptic|armenian|maronite|syriac|chaldean/i;
const TIBETAN = /tibet|vajrayana|gelug|kagyu|nyingma|sakya/i;

/** The gestures offered at a place: the main one first. */
export function gesturesFor(faith: FaithKey | string, tradition?: string | null): Gesture[] {
  const t = tradition ?? "";
  const list = ((): GestureKind[] => {
    switch (faith) {
      case "christianity":
        return LITURGICAL.test(t) ? ["candle", "prayer"] : t ? ["prayer"] : ["prayer", "candle"];
      case "islam":
        return ["dua"];
      case "judaism":
        return ["note"];
      case "hinduism":
        return ["diya", "flowers"];
      case "jainism":
        return ["diya", "flowers"];
      case "buddhism":
        return TIBETAN.test(t) ? ["butter-lamp", "incense", "flowers"] : ["incense", "flowers"];
      case "chinese":
        return ["incense"];
      case "shinto":
        return ["ema"];
      case "sikhism":
        return ["ardas"];
      default:
        return ["prayer"]; // Bahá'í, Zoroastrian and others: a simple prayer, no flame
    }
  })();
  return list.map((k) => GESTURES[k]);
}

export const isGestureKind = (v: unknown): v is GestureKind => typeof v === "string" && v in GESTURES;
