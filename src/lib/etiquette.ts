/**
 * Visitor etiquette by tradition: dress, shoes, photos and conduct.
 * General guidance only; customs vary by community, so we always add
 * "follow local signs and ask if unsure".
 */
import type { FaithKey } from "./faiths";

export interface Etiquette {
  dress: string;
  shoes?: string;
  head?: string;
  photos: string;
  conduct: string[];
}

const ETIQUETTE: Record<FaithKey, Etiquette> = {
  christianity: {
    dress: "Modest clothing; shoulders and knees covered, especially in cathedrals and Orthodox churches (often enforced in Italy, Greece and Spain).",
    head: "Men usually remove hats. In some Orthodox churches women cover their hair; scarves are often provided.",
    photos: "Usually allowed without flash outside services. Never during Mass or a service.",
    conduct: ["Speak quietly and silence your phone.", "Don't walk around during a service; visitors are welcome to sit at the back.", "Only baptised Catholics receive Communion at Mass; others may come forward for a blessing with arms crossed, or stay seated."],
  },
  islam: {
    dress: "Loose clothing covering arms and legs. Women cover their hair; many large mosques lend robes and scarves.",
    shoes: "Remove shoes before the prayer hall; use the racks provided.",
    photos: "Often allowed in visitor areas; never photograph people praying.",
    conduct: ["Avoid visiting during the five daily prayers, especially Friday midday (Jumu'ah), unless joining.", "Don't walk in front of someone praying.", "Some mosques have separate areas or times for visitors."],
  },
  judaism: {
    dress: "Modest clothing.",
    head: "Men cover their heads; kippot are usually available at the entrance. Married women in Orthodox synagogues may cover their hair.",
    photos: "Not on Shabbat (Friday sunset to Saturday nightfall) or festivals. Ask at other times.",
    conduct: ["Many synagogues have security checks; bring ID and expect questions.", "In Orthodox synagogues men and women sit separately.", "Avoid using phones on Shabbat."],
  },
  hinduism: {
    dress: "Modest, covering shoulders and legs; some temples (notably in Kerala) have stricter dress codes, and a few admit Hindus only.",
    shoes: "Remove shoes, and sometimes socks, before entering.",
    photos: "Usually not allowed in the inner sanctum (garbhagriha).",
    conduct: ["Walk clockwise around shrines.", "Accept prasad (blessed food) with your right hand.", "Leather items are not welcome in some temples."],
  },
  buddhism: {
    dress: "Shoulders and knees covered.",
    shoes: "Remove shoes before entering shrine halls.",
    photos: "Usually allowed; ask first, and never pose with your back to a Buddha image.",
    conduct: ["Don't point your feet at images or monks; sit with feet tucked.", "Walk clockwise around stupas.", "In some traditions women should not touch monks or hand things to them directly."],
  },
  sikhism: {
    dress: "Modest clothing.",
    head: "Everyone covers their head; scarves are provided at the entrance.",
    shoes: "Remove shoes and wash hands (often feet too) before entering.",
    photos: "Ask first; often not allowed inside the main hall.",
    conduct: ["No tobacco or alcohol on the premises.", "Sit on the floor, feet not pointing at the Guru Granth Sahib.", "Everyone is welcome to share the free meal (langar)."],
  },
  shinto: {
    dress: "Neat, respectful clothing.",
    photos: "Usually allowed outdoors; often not inside the main hall.",
    conduct: ["Bow once at the torii gate; the centre of the path is for the kami.", "Purify hands and mouth at the temizuya basin.", "At the hall: offer a coin, bow twice, clap twice, pray, bow once."],
  },
  jainism: {
    dress: "Modest clothing; leather items (belts, bags, watch straps) are not allowed inside.",
    shoes: "Remove shoes.",
    photos: "Often not allowed in the inner shrine.",
    conduct: ["No food inside the temple.", "Some temples welcome visitors only at certain hours; check locally.", "Speak quietly."],
  },
  bahai: {
    dress: "Modest clothing.",
    photos: "Allowed in gardens; usually not inside the House of Worship.",
    conduct: ["Houses of Worship are open to people of all faiths.", "Prayers and readings are held in silence; no sermons.", "Take a seat quietly and stay as long as you like."],
  },
  chinese: {
    dress: "Neat, modest clothing.",
    photos: "Usually allowed; ask before photographing people at prayer.",
    conduct: ["Enter by the side doors, not the central one.", "Offer incense with both hands and bow.", "Don't step on door thresholds."],
  },
  zoroastrianism: {
    dress: "Modest clothing.",
    head: "Heads are covered inside.",
    photos: "Not inside.",
    conduct: ["Most fire temples (agiaries) admit only Zoroastrians to the inner area; visitors are welcome in outer areas where permitted.", "Don't approach or touch the sacred fire."],
  },
  other: {
    dress: "Modest, respectful clothing.",
    photos: "Ask before taking photos.",
    conduct: ["Speak quietly.", "Follow local signs and the guidance of the community."],
  },
};

export const etiquetteFor = (faith: string): Etiquette => ETIQUETTE[faith as FaithKey] ?? ETIQUETTE.other;
