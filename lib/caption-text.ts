/**
 * Caption text helpers shared by the Gemini parser (server) and the feed.
 * No Node-only imports here.
 */

/**
 * Normalises one caption string. Also repairs the JSON debris that week-4
 * rows picked up when Gemini's output was cut off mid-array (a caption that is
 * just `[`, or one ending in `",`).
 */
export function tidyCaption(raw: string): string {
  let t = raw
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  // Leading/trailing JSON punctuation: [ ] { } , and whitespace.
  t = t.replace(/^[\[\]{},\s]+/, "").replace(/[\[\]{},\s]+$/, "");

  // A lone quote left over from a split string literal.
  const quotes = (t.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) {
    if (t.startsWith('"')) t = t.slice(1);
    else if (t.endsWith('"')) t = t.slice(0, -1);
  } else if (quotes === 2 && t.startsWith('"') && t.endsWith('"')) {
    t = t.slice(1, -1);
  }
  return t.trim();
}

/** Letters in any script (ES2017-safe: no \p{L}). */
const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ㐀-鿿가-힯]/g;

/** True when the string reads like an actual caption, not a fragment. */
export function isUsableCaption(t: string): boolean {
  const letters = t.match(LETTER)?.length ?? 0;
  return letters >= 6 && t.length <= 300;
}
