/**
 * Match an Other item's text to a category by meaning.
 *
 * Exact aliases win outright. Otherwise every active category is scored by
 * how close in meaning the item is to the category's name or any of its
 * aliases, and the scores decide what staff are shown.
 */
import { normalizeText } from "../core/normalize";
import type { CategoryOption, MatchMode } from "../model/types";
import { cosine, type Embedder } from "./embedder";
import type { CategoryList } from "./model";
import { provisionalId } from "./store";
import calibrated from "./thresholds.json";

/**
 * When a match is strong enough to act on.
 *
 * Attributes
 * ----------
 * autoSelect : float
 *     At or above this similarity, the top category is pre-selected.
 * offer : float
 *     At or above this, the top three categories are offered. Below it, a new
 *     category is proposed.
 */
export interface MatchThresholds {
  autoSelect: number;
  offer: number;
}

/** Thresholds chosen by tools/calibrate-matching.ts from labelled pairs */
export const MATCH_THRESHOLDS: MatchThresholds = { autoSelect: calibrated.autoSelect, offer: calibrated.offer };

/** How many categories are offered to choose from */
const OFFERED = 3;

/**
 * The outcome of matching one item.
 *
 * Attributes
 * ----------
 * mode : MatchMode
 * options : list[CategoryOption]
 *     The best categories, best first. Staff can still pick any category.
 * choice : CategoryOption | None
 *     Pre-selected for exact, auto, new, and provisional matches. Empty when
 *     staff must choose.
 */
export interface MatchResult {
  mode: MatchMode;
  options: CategoryOption[];
  choice?: CategoryOption;
}

const option = (c: { id: string; name: string; printed: boolean }, score?: number): CategoryOption => ({
  categoryId: c.id,
  name: c.name,
  printed: c.printed,
  ...(score !== undefined ? { score } : {}),
});

/**
 * Score every active category by closeness in meaning to `text`.
 *
 * Returns
 * -------
 * Options sorted best first, each with its similarity score.
 */
export async function rankCategories(text: string, list: CategoryList, embed: Embedder): Promise<CategoryOption[]> {
  const categories = list.active();
  const candidates: { categoryId: string; text: string }[] = [];
  for (const c of categories) {
    candidates.push({ categoryId: c.id, text: normalizeText(c.name) });
    for (const a of list.aliasesOf(c.id)) candidates.push({ categoryId: c.id, text: a });
  }
  const unique = [...new Set([normalizeText(text), ...candidates.map((c) => c.text)])];
  const vectors = new Map((await embed(unique)).map((v, i) => [unique[i], v]));
  const query = vectors.get(normalizeText(text))!;

  const best = new Map<string, number>();
  for (const c of candidates) {
    const s = cosine(query, vectors.get(c.text)!);
    if (s > (best.get(c.categoryId) ?? -1)) best.set(c.categoryId, s);
  }
  return categories.map((c) => option(c, best.get(c.id) ?? 0)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * Match an Other item to a category.
 *
 * Example
 * -------
 * With a "Wagons / carts" category that has the alias "wagon":
 *
 * - "Wagon" is an exact alias after normalization. Mode "exact", pre-selected.
 * - "cart" scores about 0.6 against "wagon". That's between the thresholds,
 *   so mode "choose" offers the top three with "Wagons / carts" among them.
 * - "kayak paddle" scores low against everything. Mode "new" proposes a new
 *   category named "kayak paddle", and still lists the top three.
 * - With no store available, every item gets mode "provisional", named from
 *   its text.
 *
 * Returns
 * -------
 * The match mode, the categories to offer, and any pre-selected choice.
 */
export async function matchItem(
  text: string,
  list: CategoryList,
  embed: Embedder | null,
  storeAvailable: boolean,
  thresholds: MatchThresholds = MATCH_THRESHOLDS,
): Promise<MatchResult> {
  const normalized = normalizeText(text);
  const fresh: CategoryOption = { categoryId: "new", name: text.trim(), printed: false };

  // An exact alias or category name needs no decision
  const exact = list.lookupAlias(text) ?? list.active().find((c) => normalizeText(c.name) === normalized);
  if (exact) return { mode: "exact", options: [option(exact)], choice: option(exact) };

  if (!storeAvailable) {
    return { mode: "provisional", options: [], choice: { categoryId: provisionalId(normalized), name: text.trim(), printed: false } };
  }
  if (!embed || !normalized) return { mode: "new", options: [], choice: fresh };

  const ranked = (await rankCategories(text, list, embed)).slice(0, OFFERED);
  const top = ranked[0]?.score ?? 0;
  if (top >= thresholds.autoSelect) return { mode: "auto", options: ranked, choice: ranked[0] };
  if (top >= thresholds.offer) return { mode: "choose", options: ranked };
  return { mode: "new", options: ranked, choice: fresh };
}
