/**
 * Turn confirmed cards into export rows.
 *
 * Rows are long format: one per non-blank item count per card. New Other
 * categories add rows, never columns, so the shape never changes.
 */
import type { CardLayout, NumberField } from "../cards/schema";
import type { CardRecord } from "../model/types";

/**
 * The export columns, in order.
 *
 * - card_id, card_version, source_file: which card the row came from
 * - name_or_group through est_sq_miles: the card's header fields, repeated on every row
 * - section, category_id, category_name, category_printed, count: the item count
 * - other_raw_text: what the volunteer wrote, for rows from Other rows
 * - category_provisional: true when the category is a provisional one to merge later
 */
export const COLUMNS = [
  "card_id",
  "card_version",
  "source_file",
  "name_or_group",
  "date",
  "location",
  "volunteers",
  "duration_hours",
  "est_pounds",
  "est_gallons",
  "est_sq_miles",
  "section",
  "category_id",
  "category_name",
  "category_printed",
  "count",
  "other_raw_text",
  "category_provisional",
] as const;

export type Row = Record<(typeof COLUMNS)[number], string>;

/** "06/14/26" as "2026-06-14". Anything else is passed through */
function isoDate(v: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(v);
  return m ? `20${m[3]}-${m[1]}-${m[2]}` : v;
}

/** Export rows for one confirmed card, in layout order */
export function cardRows(card: CardRecord, layout: CardLayout): Row[] {
  const v = (id: string) => card.fields[id]?.value.trim() ?? "";
  const base = {
    card_id: card.id,
    card_version: card.version ?? layout.version,
    source_file: card.sourceName,
    name_or_group: v("header.name"),
    date: isoDate(v("header.date")),
    location: v("header.location"),
    volunteers: v("header.volunteers"),
    duration_hours: v("header.duration"),
    est_pounds: v("header.pounds"),
    est_gallons: v("header.gallons"),
    est_sq_miles: v("header.sq-miles"),
  };
  const rows: Row[] = [];
  for (const f of layout.fields) {
    if (f.kind !== "number") continue;
    if (f.role === "item") {
      const count = v(f.id);
      if (!count) continue;
      rows.push({
        ...base,
        section: f.section,
        category_id: f.categoryId!,
        category_name: (f as NumberField).categoryName ?? f.label,
        category_printed: "true",
        count,
        other_raw_text: "",
        category_provisional: "false",
      });
    } else if (f.role === "other-count") {
      const row = f.otherRow!;
      const text = v(`other.${row}.name`);
      const count = v(f.id);
      if (!count && !text) continue;
      const choice = card.others[row]?.choice;
      const id = choice?.categoryId ?? "";
      rows.push({
        ...base,
        section: f.section,
        category_id: id,
        category_name: card.categoryNames?.[id] ?? choice?.name ?? text,
        category_printed: String(choice?.printed ?? false),
        count,
        other_raw_text: text,
        category_provisional: String(id.startsWith("provisional:")),
      });
    }
  }
  return rows;
}
