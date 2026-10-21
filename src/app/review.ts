/**
 * Review rules: which fields need attention, in what order, and when a card
 * can be confirmed.
 *
 * These are pure functions of a card and its layout, so the rules are tested
 * without a browser.
 */
import type { CardLayout, Field } from "../cards/schema";
import type { FieldReading } from "../pipeline/fields";
import type { CardRecord, FieldState } from "../model/types";

/** A review item: a printed field, or the category choice for an Other row */
export type ReviewItem =
  | { kind: "field"; id: string; field: Field }
  | { kind: "category"; id: string; row: number };

/** The review item ID for an Other row's category choice */
export const categoryItemId = (row: number) => `other.${row}.category`;

/** Initial review state for a field from what recognition read */
export function fieldStateFrom(r: FieldReading): FieldState {
  return {
    value: r.value,
    proposed: r.value,
    blank: r.blank,
    flags: r.flags,
    ...(r.suggestion !== undefined ? { suggestion: r.suggestion } : {}),
    needsAttention: r.flags.length > 0 || r.needsConfirmation,
    accepted: false,
  };
}

/** Empty review state for every field, for a card entered by hand */
export function manualFieldStates(layout: CardLayout): Record<string, FieldState> {
  return Object.fromEntries(
    layout.fields.map((f) => [f.id, { value: "", proposed: "", blank: true, flags: [], needsAttention: false, accepted: false }]),
  );
}

/** Other rows the volunteer (or staff) wrote anything in */
export function usedOtherRows(card: CardRecord, layout: CardLayout): number[] {
  const rows = new Set<number>();
  for (const f of layout.fields) {
    if (f.otherRow && card.fields[f.id]?.value.trim()) rows.add(f.otherRow);
  }
  return [...rows].sort((a, b) => a - b);
}

/** Whether a review item still needs staff to act on it */
export function isOutstanding(card: CardRecord, item: ReviewItem): boolean {
  if (item.kind === "category") return !card.others[item.row]?.accepted;
  const s = card.fields[item.id];
  return !!s && s.needsAttention && !s.accepted;
}

/** Whether a review item needed attention when the card was read */
function needsAttention(card: CardRecord, item: ReviewItem): boolean {
  return item.kind === "category" || !!card.fields[item.id]?.needsAttention;
}

/**
 * Every review item on a card, attention-first.
 *
 * Flagged fields, text fields to confirm, and category choices for used Other
 * rows come first, in layout order. Everything else follows in layout order.
 * The order is fixed by what needed attention when the card was read, so
 * items don't jump around as staff accept them.
 */
export function reviewOrder(card: CardRecord, layout: CardLayout): ReviewItem[] {
  const items: ReviewItem[] = [];
  const used = new Set(usedOtherRows(card, layout));
  for (const f of layout.fields) {
    items.push({ kind: "field", id: f.id, field: f });
    // The category choice follows its row's count
    if (f.role === "other-count" && used.has(f.otherRow!)) items.push({ kind: "category", id: categoryItemId(f.otherRow!), row: f.otherRow! });
  }
  const first = items.filter((i) => needsAttention(card, i));
  const rest = items.filter((i) => !needsAttention(card, i));
  return [...first, ...rest];
}

/** Review items that still need staff to act, in review order */
export function outstanding(card: CardRecord, layout: CardLayout): ReviewItem[] {
  return reviewOrder(card, layout).filter((i) => isOutstanding(card, i));
}

/** Whether every field and category needing attention has been dealt with */
export function canConfirm(card: CardRecord, layout: CardLayout): boolean {
  return outstanding(card, layout).length === 0;
}
