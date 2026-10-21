/**
 * Normalize an Other item's text for alias lookup and embedding.
 *
 * Example
 * -------
 * "  Water-Bottles!! " normalizes to "water bottle".
 *
 * - Case and accents are dropped.
 * - Punctuation becomes spaces, and runs of spaces collapse.
 * - Each word is naively singularized: "bottles" to "bottle", "boxes" to
 *   "box", "batteries" to "battery". Words ending in "ss", "us", or "is" are
 *   left alone, so "glass" stays "glass".
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(sses|ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}
