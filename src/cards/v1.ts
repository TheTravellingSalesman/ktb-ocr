/**
 * Card version 1, the first machine-readable Cleanup Data Card.
 *
 * Every category and section from the 2022 card is kept, in the 2022 order.
 * Positions come from a small flow layout below, so moving a row means
 * changing a number here and regenerating. Nothing is positioned by hand in
 * two places.
 */
import {
  CARD_FRAME,
  frameMarkers,
  type CardDefinition,
  type Decoration,
  type Field,
  type NumberField,
  type Rect,
  type Section,
  type TextField,
} from "./schema";
import { COLORS } from "./style";


/** Digit box size and spacing, in mm */
const BOX = { w: 6.2, h: 6, gap: 0.5, decimalGap: 2.2, dateGap: 2.6 };
const ROW_H = 7;
const OTHER_ROW_H = 8;
const BAR_H = 5.5;
const COLUMN_W = 96;
const COLUMNS = [10, 110];
const ITEMS_TOP = 64;
const ITEMS_BOTTOM = 255;
const LABEL_W = 43;
/** Rough average glyph width of the bold section titles, as a fraction of font size */
const TITLE_GLYPH_WIDTH = 0.55;

interface ItemSpec {
  label: string;
  id: string;
  name?: string;
  boxes?: number;
  /** Rows of height the item takes, for items that collect large tallies */
  tall?: number;
}

interface SectionSpec {
  section: Section;
  column: 0 | 1;
  items: ItemSpec[];
}

const SECTIONS: SectionSpec[] = [
  {
    section: { id: "common", title: "Common items (tobacco, food, drink products)" },
    column: 0,
    items: [
      { label: "Cigarette butts", id: "cigarette-butts", boxes: 4, tall: 3 },
      { label: "Tobacco (lighters, vapes, cigar tips, packs)", id: "tobacco" },
      { label: "Bags (plastic grocery)", id: "bags-plastic-grocery" },
      { label: "Bags (plastic other)", id: "bags-plastic-other" },
      { label: "Bags (paper)", id: "bags-paper" },
      { label: "Bottles (plastic)", id: "bottles-plastic" },
      { label: "Bottles (glass)", id: "bottles-glass" },
      { label: "Bottle cap (plastic)", id: "bottle-caps-plastic" },
      { label: "Bottle cap (metal)", id: "bottle-caps-metal" },
      { label: "Cans / pull tabs (metal)", id: "cans-pull-tabs" },
      { label: "Cups (foam)", id: "cups-foam" },
      { label: "Cups (plastic)", id: "cups-plastic" },
      { label: "Cups (paper)", id: "cups-paper" },
      { label: "Food waste", id: "food-waste" },
      { label: "Food wrappers", id: "food-wrappers" },
      { label: "Lids", id: "lids" },
      { label: "Plates (foam)", id: "plates-foam" },
      { label: "Plates (plastic)", id: "plates-plastic" },
      { label: "Plates (paper)", id: "plates-paper" },
      { label: "Straws/stirs/straw wrappers (plastic)", id: "straws-stirs" },
      { label: "Take out container (foam)", id: "takeout-foam" },
      { label: "Take out container (plastic)", id: "takeout-plastic" },
      { label: "Take out container (paper)", id: "takeout-paper" },
      { label: "Utensils", id: "utensils" },
    ],
  },
  {
    section: { id: "local", title: "Local concern" },
    column: 1,
    items: [
      { label: "Dog waste in bag", id: "dog-waste-bagged" },
      { label: "Dog waste not in bag (piles)", id: "dog-waste-unbagged" },
      { label: "Wildlife waste with trash in it (piles)", id: "wildlife-waste-with-trash" },
      { label: "Sleds (large pieces)", id: "sleds" },
      { label: "Fireworks & celebration items (consumer)", id: "fireworks-consumer" },
      { label: "Fireworks (commercial)", id: "fireworks-commercial" },
    ],
  },
  {
    section: { id: "hygiene", title: "Personal hygiene" },
    column: 1,
    items: [
      { label: "COVID items (mask, wipes, gloves)", id: "covid-items" },
      { label: "Sanitary items (diapers, tampon)", id: "sanitary-items" },
      { label: "Toilet paper", id: "toilet-paper" },
      { label: "Human waste (don't pick up)", id: "human-waste" },
      { label: "Protection (band aid, condom)", id: "protection" },
      { label: "Syringes (don't pick up)", id: "syringes" },
    ],
  },
  {
    section: { id: "smaller", title: "Pieces smaller than a quarter" },
    column: 1,
    items: [
      { label: "Foam pieces", id: "small-foam", name: "Foam pieces (smaller than a quarter)", boxes: 4 },
      { label: "Glass pieces", id: "small-glass", name: "Glass pieces (smaller than a quarter)", boxes: 4 },
      { label: "Plastic pieces", id: "small-plastic", name: "Plastic pieces (smaller than a quarter)", boxes: 4 },
    ],
  },
  {
    section: { id: "larger", title: "Pieces larger than a quarter" },
    column: 1,
    items: [
      { label: "Foam pieces", id: "large-foam", name: "Foam pieces (larger than a quarter)" },
      { label: "Glass pieces", id: "large-glass", name: "Glass pieces (larger than a quarter)" },
      { label: "Plastic pieces", id: "large-plastic", name: "Plastic pieces (larger than a quarter)" },
    ],
  },
];

const OTHER_SECTION: Section = { id: "other", title: "Other (common items or concerns)" };
const OTHER_ROWS = 4;
const HEADER_SECTION: Section = { id: "header", title: "About this cleanup" };

/** A row of digit boxes starting at `x`, with extra space where a separator is printed */
function boxRow(x: number, y: number, count: number, wideGapAfter: number[] = [], wideGap = 0): Rect[] {
  const boxes: Rect[] = [];
  let cx = x;
  for (let i = 0; i < count; i++) {
    boxes.push({ x: cx, y, w: BOX.w, h: BOX.h });
    cx += BOX.w + (wideGapAfter.includes(i) ? wideGap : BOX.gap);
  }
  return boxes;
}

/** Width of a plain row of `count` digit boxes */
function boxRowWidth(count: number): number {
  return count * BOX.w + (count - 1) * BOX.gap;
}

/** The header fields: who, when, where, and how much */
function headerFields(): { fields: Field[]; decorations: Decoration[] } {
  const fields: Field[] = [];
  const decorations: Decoration[] = [];
  const rowY = [25.5, 34.5, 43.5];
  const textField = (id: string, label: string, y: number, labelX: number, labelW: number, w: number): TextField => ({
    kind: "text",
    id,
    label,
    section: HEADER_SECTION.id,
    role: "header",
    labelRect: { x: labelX, y, w: labelW, h: 7.5 },
    textRect: { x: labelX + labelW, y, w, h: 7.5 },
  });
  const numberField = (
    id: string,
    label: string,
    y: number,
    labelX: number,
    labelW: number,
    count: number,
    format: NumberField["format"],
    decimalAfter?: number,
  ): NumberField => {
    const bx = labelX + labelW;
    const by = y + 0.75;
    const boxes =
      format === "date"
        ? boxRow(bx, by, count, [1, 3], BOX.dateGap)
        : format === "decimal"
          ? boxRow(bx, by, count, [decimalAfter!], BOX.decimalGap)
          : boxRow(bx, by, count);
    return {
      kind: "number",
      id,
      label,
      section: HEADER_SECTION.id,
      role: "header",
      labelRect: { x: labelX, y, w: labelW, h: 7.5 },
      boxes,
      format,
      ...(decimalAfter !== undefined ? { decimalAfter } : {}),
    };
  };

  fields.push(textField("header.name", "Name or group", rowY[0], 10, 25, 100));
  fields.push(numberField("header.date", "Date", rowY[0], 137, 12, 6, "date"));
  fields.push(textField("header.location", "Location", rowY[1], 10, 25, 100));
  fields.push(numberField("header.volunteers", "# of volunteers", rowY[1], 137, 22, 3, "integer"));
  fields.push(numberField("header.duration", "Duration (hours)", rowY[2], 10, 25, 3, "decimal", 1));
  fields.push(numberField("header.pounds", "Est. pounds", rowY[2], 61, 18, 4, "integer"));
  fields.push(numberField("header.gallons", "Est. gallons", rowY[2], 111, 18, 3, "integer"));
  fields.push(numberField("header.sq-miles", "Est. sq. miles", rowY[2], 155, 21, 3, "decimal", 0));

  // Small "MM DD YY" hint under the date boxes, in dropout so it reads as a guide only
  const date = fields[1] as NumberField;
  const hints = ["M", "M", "D", "D", "Y", "Y"];
  date.boxes.forEach((b, i) =>
    decorations.push({ type: "text", x: b.x + b.w / 2, y: b.y + b.h - 1.2, text: hints[i], size: 2.2, color: COLORS.dropout, anchor: "middle" }),
  );
  return { fields, decorations };
}

/** The title, instructions, worked example, and footer */
function staticDecorations(): Decoration[] {
  const d: Decoration[] = [];
  d.push({ type: "text", x: 25, y: 14.5, text: "KEEP TAHOE BLUE", size: 7.5, weight: 800, color: COLORS.blue });
  d.push({ type: "text", x: 25, y: 19.6, text: "League to Save Lake Tahoe", size: 3, italic: true, color: COLORS.blue });
  d.push({ type: "text", x: 168, y: 14.5, text: "CLEANUP DATA CARD", size: 6, weight: 800, color: COLORS.blue, anchor: "end" });
  d.push({ type: "text", x: 168, y: 19.6, text: "Card version 1 · Use a dark pen · Print in block letters", size: 2.6, color: COLORS.ink, anchor: "end" });

  // Instructions band with a worked example
  d.push({ type: "rect", rect: { x: 10, y: 53, w: 196, h: 9.5 }, fill: "#e3eef8", radius: 1 });
  d.push({ type: "text", x: 12, y: 57, text: "Citizen Scientist: pick up all trash. Make tally marks as you go,", size: 2.7, weight: 600, color: COLORS.ink });
  d.push({ type: "text", x: 12, y: 60.6, text: "then write the total in the boxes, one digit per box. Numbers only.", size: 2.7, color: COLORS.ink });
  d.push({ type: "text", x: 118, y: 59.3, text: "Example:", size: 2.7, weight: 700, color: COLORS.blue });
  d.push({ type: "text", x: 131, y: 59.3, text: "Bottles (plastic)", size: 2.6, color: COLORS.ink });
  d.push({ type: "rect", rect: { x: 155, y: 54.3, w: 28, h: 7 }, stroke: COLORS.dropout, strokeWidth: 0.3 });
  d.push({ type: "tally", rect: { x: 156, y: 55, w: 26, h: 5.6 }, count: 17, color: COLORS.ink });
  const ex = boxRow(185, 54.8, 3);
  ex.forEach((b) => d.push({ type: "rect", rect: b, stroke: COLORS.dropout, strokeWidth: 0.35 }));
  d.push({ type: "handDigit", rect: ex[0], digit: "1", color: COLORS.ink });
  d.push({ type: "handDigit", rect: ex[1], digit: "7", color: COLORS.ink });

  // Footer
  d.push({
    type: "text",
    x: 107.95,
    y: 263.5,
    text: "Return this card to your site coordinator, or photograph the whole card with all four corner squares",
    size: 2.7,
    weight: 600,
    color: COLORS.ink,
    anchor: "middle",
  });
  d.push({ type: "text", x: 107.95, y: 267.3, text: "in view and email it to events@keeptahoeblue.org. Data you collect is used to advocate for solutions!", size: 2.7, color: COLORS.ink, anchor: "middle" });
  d.push({ type: "text", x: 107.95, y: 271.1, text: "Thank you for participating! Share your photos with #KeepTahoeBlue and #TahoeBlueGooder", size: 2.5, color: COLORS.blue, anchor: "middle" });
  return d;
}

/** A blue section bar with "tally" and "total" captions over the columns below it */
function sectionBar(x: number, y: number, title: string, tallyX: number, totalX: number): Decoration[] {
  return [
    { type: "rect", rect: { x, y, w: COLUMN_W, h: BAR_H }, fill: COLORS.blue },
    { type: "text", x: x + 1.5, y: y + 3.9, text: title, size: 3, weight: 700, color: COLORS.white },
    // Long titles run over the tally column, so its caption is left off there
    ...(x + 1.5 + title.length * 3 * TITLE_GLYPH_WIDTH < tallyX - 1
      ? [{ type: "text" as const, x: tallyX, y: y + 3.9, text: "tally", size: 2.3, color: COLORS.white }]
      : []),
    { type: "text", x: totalX, y: y + 3.9, text: "total", size: 2.3, weight: 700, color: COLORS.white },
  ];
}

/** Lay out the item sections and Other rows in two columns */
function itemFields(): { fields: Field[]; decorations: Decoration[] } {
  const fields: Field[] = [];
  const decorations: Decoration[] = [];
  const cursor = [ITEMS_TOP, ITEMS_TOP];
  const boxesRight = (x0: number) => x0 + COLUMN_W - 0.5;

  for (const spec of SECTIONS) {
    const x0 = COLUMNS[spec.column];
    const right = boxesRight(x0);
    decorations.push(...sectionBar(x0, cursor[spec.column], spec.section.title, x0 + LABEL_W + 3, right - boxRowWidth(3)));
    cursor[spec.column] += BAR_H;

    for (const item of spec.items) {
      const y = cursor[spec.column];
      const rows = item.tall ?? 1;
      const h = ROW_H * rows;
      const count = item.boxes ?? 3;
      const bx = right - boxRowWidth(count);
      const field: NumberField = {
        kind: "number",
        id: `item.${item.id}`,
        label: item.label,
        section: spec.section.id,
        role: "item",
        categoryId: item.id,
        ...(item.name ? { categoryName: item.name } : {}),
        labelRect: rows > 1 ? { x: x0 + 1, y, w: COLUMN_W - 2, h: ROW_H } : { x: x0 + 1, y, w: LABEL_W, h: ROW_H },
        // Tall items get a big tally area under their label
        tallyRect:
          rows > 1
            ? { x: x0 + 1, y: y + ROW_H - 0.5, w: bx - 2 - (x0 + 1), h: h - ROW_H }
            : { x: x0 + LABEL_W + 2, y: y + 0.5, w: bx - 2 - (x0 + LABEL_W + 2), h: ROW_H - 1 },
        boxes: boxRow(bx, y + (rows > 1 ? (h - BOX.h) / 2 + ROW_H / 2 : 0.5), count),
        format: "integer",
      };
      fields.push(field);
      decorations.push({ type: "line", x1: x0, y1: y + h, x2: x0 + COLUMN_W, y2: y + h, stroke: COLORS.dropout, strokeWidth: 0.25 });
      cursor[spec.column] += h;
    }
  }

  // Other rows go at the bottom of the second column
  const x0 = COLUMNS[1];
  const right = boxesRight(x0);
  const bx = right - boxRowWidth(3);
  decorations.push(...sectionBar(x0, cursor[1], OTHER_SECTION.title, x0 + LABEL_W + 3, bx));
  decorations.push({ type: "text", x: x0 + 1, y: cursor[1] + BAR_H + 2.4, text: "Write each item's name in BLOCK LETTERS", size: 2.2, italic: true, color: COLORS.ink });
  cursor[1] += BAR_H + 3;
  for (let row = 1; row <= OTHER_ROWS; row++) {
    const y = cursor[1];
    fields.push({
      kind: "text",
      id: `other.${row}.name`,
      label: `Other item ${row} name`,
      section: OTHER_SECTION.id,
      role: "other-name",
      otherRow: row,
      textRect: { x: x0 + 1, y: y + 0.5, w: LABEL_W, h: OTHER_ROW_H - 1 },
    });
    fields.push({
      kind: "number",
      id: `other.${row}.count`,
      label: `Other item ${row} count`,
      section: OTHER_SECTION.id,
      role: "other-count",
      otherRow: row,
      labelRect: { x: x0 + 1, y, w: LABEL_W, h: OTHER_ROW_H },
      tallyRect: { x: x0 + LABEL_W + 2, y: y + 0.5, w: bx - 2 - (x0 + LABEL_W + 2), h: OTHER_ROW_H - 1 },
      boxes: boxRow(bx, y + (OTHER_ROW_H - BOX.h) / 2, 3),
      format: "integer",
    });
    cursor[1] += OTHER_ROW_H;
  }

  for (const c of cursor) {
    if (c > ITEMS_BOTTOM) throw new Error(`card v1 layout overflows the item area (${c.toFixed(1)} > ${ITEMS_BOTTOM} mm)`);
  }
  return { fields, decorations };
}

/** Build the version 1 card definition */
export function buildCardV1(): CardDefinition {
  const header = headerFields();
  const items = itemFields();
  return {
    version: "1",
    versionCode: "KTBCARD:1",
    page: { ...CARD_FRAME.page },
    markers: frameMarkers(),
    versionCodeRect: { ...CARD_FRAME.versionCodeRect },
    sections: [HEADER_SECTION, ...SECTIONS.map((s) => s.section), OTHER_SECTION],
    fields: [...header.fields, ...items.fields],
    decorations: [...staticDecorations(), ...header.decorations, ...items.decorations],
  };
}
