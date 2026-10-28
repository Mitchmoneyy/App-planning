/**
 * Normalise faith + denomination from the many ways sources describe them
 * (OSM religion/denomination tags, Overture categories, and names in many
 * languages). Keys match src/lib/faiths.ts.
 */

const OSM_RELIGION = {
  christian: "christianity", muslim: "islam", jewish: "judaism", hindu: "hinduism", buddhist: "buddhism",
  sikh: "sikhism", shinto: "shinto", jain: "jainism", bahai: "bahai", taoist: "chinese", confucian: "chinese",
  chinese_folk: "chinese", zoroastrian: "zoroastrianism", caodaism: "other", unitarian_universalist: "christianity",
  spiritualist: "other", tenrikyo: "other", multifaith: "other", pagan: "other", voodoo: "other", animist: "other",
};

/** Overture category -> [faith, tradition] */
const OVERTURE = {
  christian_place_of_worship: ["christianity", null],
  roman_catholic_place_of_worship: ["christianity", "Catholic"],
  catholic_place_of_worship: ["christianity", "Catholic"],
  baptist_place_of_worship: ["christianity", "Baptist"],
  protestant_place_of_worship: ["christianity", "Protestant"],
  pentecostal_place_of_worship: ["christianity", "Pentecostal"],
  anglican_or_episcopal_place_of_worship: ["christianity", "Anglican / Episcopal"],
  methodist_place_of_worship: ["christianity", "Methodist"],
  lutheran_place_of_worship: ["christianity", "Lutheran"],
  presbyterian_place_of_worship: ["christianity", "Presbyterian"],
  evangelical_place_of_worship: ["christianity", "Evangelical"],
  eastern_orthodox_place_of_worship: ["christianity", "Orthodox"],
  greek_orthodox_place_of_worship: ["christianity", "Greek Orthodox"],
  russian_orthodox_place_of_worship: ["christianity", "Russian Orthodox"],
  coptic_orthodox_place_of_worship: ["christianity", "Coptic Orthodox"],
  jehovahs_witness_place_of_worship: ["christianity", "Jehovah's Witnesses"],
  mormon_place_of_worship: ["christianity", "Latter-day Saints"],
  latter_day_saints_place_of_worship: ["christianity", "Latter-day Saints"],
  seventh_day_adventist_place_of_worship: ["christianity", "Seventh-day Adventist"],
  church_cathedral: ["christianity", null],
  muslim_place_of_worship: ["islam", null],
  mosque: ["islam", null],
  jewish_place_of_worship: ["judaism", null],
  synagogue: ["judaism", null],
  hindu_place_of_worship: ["hinduism", null],
  hindu_temple: ["hinduism", null],
  buddhist_place_of_worship: ["buddhism", null],
  buddhist_temple: ["buddhism", null],
  sikh_place_of_worship: ["sikhism", null],
  sikh_temple: ["sikhism", null],
  shinto_shrine: ["shinto", null],
};

// Name keywords, checked in order (most specific first). Lower-cased, accents kept.
const NAME_RULES = [
  ["sikhism", /gur(u)?d(w|u)ara|ਗੁਰਦੁਆਰਾ|gurudwara|sikh/],
  ["bahai", /bah[aá]['’]?[ií]|baha'i/],
  ["zoroastrianism", /fire temple|atash|agiary|zoroastr|dar-?e-?mihr/],
  ["jainism", /\bjain|derasar|jinalaya|basadi/],
  ["judaism", /synagog|sinagog|synagoge|\bshul\b|chabad|kehil|beth (el|israel|am|shalom|sholom|jacob|david)|beit |temple (beth|israel|emanu|sinai|shalom)|בית כנסת|congregation (beth|b'nai|bnai|shaarei|ahavath)/],
  ["islam", /mosque|masjid|masjed|mesjid|mescit|camii|\bcami\b|jami|jamia|musall?a|mush?oll?a|musolla|surau|langgar|islamic|مسجد|جامع|мечеть/],
  ["shinto", /jinja|神社|shrine.*(japan)|\bjingu|jingū|taisha|大社|神宮|inari/],
  ["chinese", /taoist|daoist|道观|宫$|tua pek kong|mazu|ma zu|guan (yu|di)|關帝|关帝|城隍|土地公|confuci/],
  ["buddhism", /\bwat\b|vihara|vihar\b|viharaya|pagoda|stupa|chedi|dhamma|dharma center|buddh|\bzen\b|soka gakkai|kyaung|zedi|gompa|chorten|monastery.*(tibet)|寺|사|절\b|chùa|jōdo|nichiren/],
  ["hinduism", /mandir|mandhir|devasthan|\bkovil|\bkoil\b|devalaya|hindu|shiva|siva|krishna|ganesh|ganapati|hanuman|durga|kali\b|vishnu|venkateswara|balaji|murugan|ayyappa|ram(a)? temple|lakshmi|iskcon|swaminarayan|मंदिर|கோயில்|ஆலயம்/],
  ["christianity", /church|iglesia|igreja|[ée]glise|kirche|chiesa|ko[sś]ci[oó]ł|kerk|kyrka|kirke|kirkko|templom|biserica|crkva|cerkev|ekklisia|εκκλησ|церк|храм|собор|chapel|capilla|capela|chapelle|kapelle|cappella|kaplica|cathedral|catedral|cath[ée]drale|basilica|bas[ií]lica|parish|parroquia|par[oó]quia|paroisse|pfarr|ministr(y|ies)|assembl(y|ies|[ée]e)|fellowship|tabernacle|gospel|evangel|baptist|bautista|methodist|metodista|pentecost|adventist|adventista|kingdom hall|sal[aã]o do reino|sal[oó]n del reino|christ|cristo|jesus|jes[uú]s|santuario|sanctuary|abbey|abbaye|abtei|convent|monastery|monasterio|mosteiro|congrega[cç][aã]o|asamblea|templo (evang|batista|bautista|adventista|cristiano)|\bsaint\b|\bst\.? |\bsan |\bsanta |\bs[aã]o /],
];

const COUNTRY_TEMPLE = {
  JP: "buddhism", IN: "hinduism", NP: "hinduism", LK: "buddhism", TH: "buddhism", MM: "buddhism", KH: "buddhism",
  LA: "buddhism", VN: "buddhism", BT: "buddhism", MN: "buddhism", KR: "buddhism", CN: "chinese", TW: "chinese",
  HK: "chinese", MO: "chinese", SG: "chinese", MY: "chinese", ID: "hinduism", FJ: "hinduism", MU: "hinduism",
};

const DENOMINATION = {
  catholic: "Catholic", roman_catholic: "Catholic", greek_catholic: "Greek Catholic", orthodox: "Orthodox",
  russian_orthodox: "Russian Orthodox", greek_orthodox: "Greek Orthodox", serbian_orthodox: "Serbian Orthodox",
  romanian_orthodox: "Romanian Orthodox", coptic_orthodox: "Coptic Orthodox", armenian_apostolic: "Armenian Apostolic",
  ethiopian_orthodox_tewahedo: "Ethiopian Orthodox", anglican: "Anglican", episcopal: "Episcopal", protestant: "Protestant",
  lutheran: "Lutheran", evangelical: "Evangelical", reformed: "Reformed", presbyterian: "Presbyterian", baptist: "Baptist",
  methodist: "Methodist", pentecostal: "Pentecostal", adventist: "Seventh-day Adventist", seventh_day_adventist: "Seventh-day Adventist",
  jehovahs_witness: "Jehovah's Witnesses", mormon: "Latter-day Saints", latter_day_saints: "Latter-day Saints",
  sunni: "Sunni", shia: "Shia", ibadi: "Ibadi", ahmadiyya: "Ahmadiyya", sufi: "Sufi", orthodox_jewish: "Orthodox",
  reform: "Reform", conservative: "Conservative", hasidic: "Hasidic", theravada: "Theravada", mahayana: "Mahayana",
  vajrayana: "Vajrayana", tibetan: "Tibetan", zen: "Zen", pure_land: "Pure Land", nichiren: "Nichiren",
  shvetambara: "Śvetāmbara", digambara: "Digambara", vaishnavism: "Vaishnava", shaivism: "Shaiva",
};

export const titleCase = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function faithFromName(name, country) {
  const n = (name ?? "").toLowerCase();
  for (const [faith, re] of NAME_RULES) if (re.test(n)) return faith;
  if (/temple|templo|tempel|temple/.test(n)) {
    if (/latter|lds|mormon|evang|bautista|adventista|batista|cristian/.test(n)) return "christianity";
    return COUNTRY_TEMPLE[country] ?? null;
  }
  return null;
}

export function fromOverture(category, name, country) {
  const known = OVERTURE[category];
  if (known && known[0] !== "christianity") return { faith: known[0], tradition: known[1] };
  if (known) {
    // Overture's "christian" catch-all sometimes tags mosques/temples; trust a clear name.
    const byName = faithFromName(name, country);
    return byName && byName !== "christianity" && known[1] === null ? { faith: byName, tradition: null } : { faith: known[0], tradition: known[1] };
  }
  return { faith: faithFromName(name, country) ?? (category === "shinto_shrine" ? "shinto" : "other"), tradition: null };
}

export function fromOsm(tags, country) {
  const religion = tags.religion;
  let faith = OSM_RELIGION[religion] ?? (religion ? "other" : null);
  if (!faith) faith = faithFromName(tags.name, country) ?? "other";
  const d = tags.denomination;
  return { faith, tradition: d ? (DENOMINATION[d] ?? titleCase(d)) : null };
}
