/**
 * How names are broken into search words. Shared by the data pipeline (which
 * builds the search index) and the server (which searches it), so both agree.
 * Plain TypeScript with no imports: Node runs it directly in the pipeline.
 */

/** Words too common to search by on their own ("church", "saint", "of"). */
export const STOP_WORDS = new Set(
  "the of a an and church mosque masjid temple synagogue chapel cathedral basilica parish st saint san santa sao são sainte de la le les el del di da do dos das du der die das von iglesia igreja eglise église kirche chiesa parroquia paroquia paróquia shrine jinja wat mandir gurdwara gurudwara holy sacred".split(" "),
);

/** Lower-case, strip Latin accents, keep letters/marks/digits of every script. */
export function fold(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

/** Distinct meaningful words of a name (all words if every one is common). */
export function searchWords(name: string | null | undefined): string[] {
  const all = fold(name).split(" ").filter((w) => w.length >= 2);
  const core = all.filter((w) => !STOP_WORDS.has(w));
  return [...new Set(core.length ? core : all)];
}

/** The index is split into shards by a word's first letters: 3 for busy prefixes, else 2. */
export const shardKeys = (word: string): string[] => [...new Set([word.slice(0, 3), word.slice(0, 2)])];
