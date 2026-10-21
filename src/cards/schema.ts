/**
 * The card definition schema.
 *
 * A card definition describes one printed version of the Cleanup Data Card.
 * Both the printable PDF and the app's field layout are generated from it, so
 * the two can never drift apart. All positions are millimetres from the
 * page's top-left corner.
 */

/** An axis-aligned rectangle in millimetres */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which page corner an alignment marker sits in */
export type Corner = "tl" | "tr" | "br" | "bl";

/**
 * One ArUco alignment marker.
 *
 * Attributes
 * ----------
 * id : number
 *     Marker ID in the ArUco 4x4 dictionary. Each corner has its own ID, which
 *     is how the app tells which way up a photo is.
 * corner : Corner
 *     The page corner the marker sits in.
 * rect : Rect
 *     The marker's square, including its black border but not its white
 *     quiet zone.
 */
export interface Marker {
  id: number;
  corner: Corner;
  rect: Rect;
}

/** A titled group of fields, such as "Common items" */
export interface Section {
  id: string;
  title: string;
}

/**
 * A field where the volunteer writes a number, one digit per box.
 *
 * Attributes
 * ----------
 * kind : "number"
 * id : str
 *     Unique within the card, e.g. "item.bottles-plastic" or "header.date".
 * label : str
 *     The printed label.
 * section : str
 *     ID of the section the field belongs to.
 * role : "item" | "header" | "other-count"
 *     Item counts for printed categories, header facts about the cleanup, or
 *     the count on a free-text Other row.
 * categoryId : str | None
 *     Stable category ID for item fields, e.g. "bottles-plastic".
 * categoryName : str | None
 *     The category's name in the shared category list, when the printed
 *     label alone is ambiguous. "Foam pieces" is printed twice, so its
 *     categories are named "Foam pieces (smaller than a quarter)" and
 *     "Foam pieces (larger than a quarter)". Defaults to `label`.
 * otherRow : int | None
 *     1-based Other row number, for Other row fields.
 * labelRect : Rect
 *     Where the label is printed.
 * tallyRect : Rect | None
 *     The tally area. Item and Other count fields have one. Header fields don't.
 * boxes : list[Rect]
 *     The digit boxes, left to right.
 * format : "integer" | "decimal" | "date"
 *     How the joined digits are read. A date reads its six boxes as MMDDYY.
 * decimalAfter : int | None
 *     For decimal fields, the index of the box the printed decimal point
 *     follows.
 */
export interface NumberField {
  kind: "number";
  id: string;
  label: string;
  section: string;
  role: "item" | "header" | "other-count";
  categoryId?: string;
  categoryName?: string;
  otherRow?: number;
  labelRect: Rect;
  tallyRect?: Rect;
  boxes: Rect[];
  format: "integer" | "decimal" | "date";
  decimalAfter?: number;
}

/**
 * A field where the volunteer writes words.
 *
 * Attributes
 * ----------
 * kind : "text"
 * id : str
 *     Unique within the card, e.g. "header.name" or "other.1.name".
 * label : str
 *     The printed label, or a description for Other rows that have none.
 * section : str
 *     ID of the section the field belongs to.
 * role : "header" | "other-name"
 *     Header facts, or the item name on a free-text Other row.
 * otherRow : int | None
 *     1-based Other row number, for Other row fields.
 * labelRect : Rect | None
 *     Where the label is printed, if it has one.
 * textRect : Rect
 *     The writing area.
 */
export interface TextField {
  kind: "text";
  id: string;
  label: string;
  section: string;
  role: "header" | "other-name";
  otherRow?: number;
  labelRect?: Rect;
  textRect: Rect;
}

export type Field = NumberField | TextField;

/**
 * Printed content that carries no data, such as the title and instructions.
 *
 * Only the card renderer reads decorations. They're left out of the layout
 * the app loads.
 */
export type Decoration =
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      weight?: number;
      color?: string;
      anchor?: "start" | "middle" | "end";
      italic?: boolean;
    }
  | { type: "rect"; rect: Rect; fill?: string; stroke?: string; strokeWidth?: number; radius?: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number }
  | { type: "tally"; rect: Rect; count: number; color: string }
  | { type: "handDigit"; rect: Rect; digit: string; color: string };

/**
 * A complete card definition for one card version.
 *
 * Attributes
 * ----------
 * version : str
 *     The card version, e.g. "1".
 * versionCode : str
 *     The text encoded in the printed QR code. It identifies this definition.
 * page : {width: float, height: float}
 *     Page size in millimetres.
 * markers : list[Marker]
 *     The four corner alignment markers.
 * versionCodeRect : Rect
 *     Where the version QR code is printed, including its quiet zone.
 * sections : list[Section]
 *     The sections, in printed order.
 * fields : list[Field]
 *     Every field, in reading order.
 * decorations : list[Decoration]
 *     Printed content with no data.
 */
export interface CardDefinition {
  version: string;
  versionCode: string;
  page: { width: number; height: number };
  markers: Marker[];
  versionCodeRect: Rect;
  sections: Section[];
  fields: Field[];
  decorations: Decoration[];
}

/** The part of a card definition the app needs to read cards */
export type CardLayout = Omit<CardDefinition, "decorations">;

/**
 * The card frame shared by every card version.
 *
 * The app aligns a photo before it knows the card's version, so marker and
 * version code positions must be the same on every version. The validator
 * enforces this. Changing it means old printed cards stop aligning.
 */
export const CARD_FRAME = {
  page: { width: 215.9, height: 279.4 },
  markerSize: 14,
  markerInset: 7,
  /** White space kept clear around each marker and the QR code */
  quietZone: 3,
  markerIds: { tl: 0, tr: 1, br: 2, bl: 3 } as Record<Corner, number>,
  versionCodeRect: { x: 172, y: 5, w: 18, h: 18 },
} as const;

/** The markers every card version prints, built from `CARD_FRAME` */
export function frameMarkers(): Marker[] {
  const { page, markerSize: s, markerInset: i, markerIds } = CARD_FRAME;
  const pos: Record<Corner, [number, number]> = {
    tl: [i, i],
    tr: [page.width - i - s, i],
    br: [page.width - i - s, page.height - i - s],
    bl: [i, page.height - i - s],
  };
  return (Object.keys(pos) as Corner[]).map((corner) => ({
    id: markerIds[corner],
    corner,
    rect: { x: pos[corner][0], y: pos[corner][1], w: s, h: s },
  }));
}

/** Minimum digit boxes on an item row, so totals up to 999 fit */
export const MIN_ITEM_BOXES = 3;

/** Smallest digit box that's comfortable to write in, in millimetres */
const MIN_BOX = { w: 5, h: 5.5 };

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** Every rectangle a field occupies, for overlap and bounds checks */
function fieldRects(f: Field): { name: string; rect: Rect }[] {
  const out: { name: string; rect: Rect }[] = [];
  if (f.kind === "number") {
    if (f.tallyRect) out.push({ name: `${f.id} tally`, rect: f.tallyRect });
    f.boxes.forEach((b, i) => out.push({ name: `${f.id} box ${i}`, rect: b }));
  } else {
    out.push({ name: `${f.id} text`, rect: f.textRect });
  }
  return out;
}

function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-6;
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

function inPage(r: Rect, page: { width: number; height: number }): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= page.width && r.y + r.h <= page.height;
}

function sameRect(a: Rect, b: Rect): boolean {
  const close = (p: number, q: number) => Math.abs(p - q) < 1e-6;
  return close(a.x, b.x) && close(a.y, b.y) && close(a.w, b.w) && close(a.h, b.h);
}

/**
 * Check a card definition and return every problem found.
 *
 * Example
 * -------
 * A definition whose item row has only two digit boxes, and whose QR code
 * was moved, returns two problems:
 *
 *     ["item.lids has 2 digit boxes, needs at least 3",
 *      "versionCodeRect must match the shared card frame"]
 *
 * - Structure checks catch missing or duplicate IDs and unknown sections.
 * - Frame checks keep markers and the QR code where every version puts them.
 * - Geometry checks keep fields on the page, apart from each other, and clear
 *   of the markers' and QR code's quiet zones.
 *
 * Returns
 * -------
 * A list of human-readable problems. Empty when the definition is valid.
 */
export function validateDefinition(def: CardDefinition): string[] {
  const problems: string[] = [];

  // Top-level identity and frame
  if (!def.version) problems.push("version is required");
  if (!def.versionCode) problems.push("versionCode is required");
  if (def.page.width !== CARD_FRAME.page.width || def.page.height !== CARD_FRAME.page.height) {
    problems.push("page size must match the shared card frame");
  }
  if (!sameRect(def.versionCodeRect, CARD_FRAME.versionCodeRect)) {
    problems.push("versionCodeRect must match the shared card frame");
  }
  const expectedMarkers = frameMarkers();
  if (def.markers.length !== 4) problems.push(`expected 4 markers, found ${def.markers.length}`);
  for (const m of expectedMarkers) {
    const found = def.markers.find((d) => d.corner === m.corner);
    if (!found || found.id !== m.id || !sameRect(found.rect, m.rect)) {
      problems.push(`marker in corner ${m.corner} must match the shared card frame`);
    }
  }

  // Sections and field structure
  const sectionIds = new Set<string>();
  for (const s of def.sections) {
    if (!ID_PATTERN.test(s.id)) problems.push(`section id "${s.id}" isn't a valid id`);
    if (sectionIds.has(s.id)) problems.push(`duplicate section id "${s.id}"`);
    sectionIds.add(s.id);
  }
  const fieldIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const f of def.fields) {
    if (!ID_PATTERN.test(f.id)) problems.push(`field id "${f.id}" isn't a valid id`);
    if (fieldIds.has(f.id)) problems.push(`duplicate field id "${f.id}"`);
    fieldIds.add(f.id);
    if (!sectionIds.has(f.section)) problems.push(`${f.id} names unknown section "${f.section}"`);
    if (!f.label) problems.push(`${f.id} has no label`);

    if (f.kind === "number") {
      if (f.role === "item") {
        if (!f.categoryId || !ID_PATTERN.test(f.categoryId)) problems.push(`${f.id} needs a valid categoryId`);
        else if (categoryIds.has(f.categoryId)) problems.push(`duplicate categoryId "${f.categoryId}"`);
        else categoryIds.add(f.categoryId);
      }
      if (f.role !== "header" && !f.tallyRect) problems.push(`${f.id} needs a tally area`);
      if (f.role !== "header" && f.boxes.length < MIN_ITEM_BOXES) {
        problems.push(`${f.id} has ${f.boxes.length} digit boxes, needs at least ${MIN_ITEM_BOXES}`);
      }
      if (f.boxes.length === 0) problems.push(`${f.id} has no digit boxes`);
      for (const b of f.boxes) {
        if (b.w < MIN_BOX.w || b.h < MIN_BOX.h) {
          problems.push(`${f.id} has a digit box smaller than ${MIN_BOX.w}x${MIN_BOX.h} mm`);
          break;
        }
      }
      if (f.format === "date" && f.boxes.length !== 6) problems.push(`${f.id} is a date and needs 6 boxes`);
      if (f.format === "decimal") {
        if (f.decimalAfter === undefined || f.decimalAfter < 0 || f.decimalAfter >= f.boxes.length - 1) {
          problems.push(`${f.id} is decimal and needs decimalAfter inside its boxes`);
        }
      }
      if (f.tallyRect && f.boxes.some((b) => b.x < f.tallyRect!.x + f.tallyRect!.w + 1)) {
        problems.push(`${f.id} needs at least 1 mm between its tally area and digit boxes`);
      }
    }
    if ((f.role === "other-count" || f.role === "other-name") && !f.otherRow) {
      problems.push(`${f.id} needs an otherRow`);
    }
  }

  // Each Other row needs both its name and its count
  const otherRows = new Map<number, Set<string>>();
  for (const f of def.fields) {
    if (f.otherRow) otherRows.set(f.otherRow, (otherRows.get(f.otherRow) ?? new Set()).add(f.role));
  }
  for (const [row, roles] of otherRows) {
    if (!roles.has("other-name") || !roles.has("other-count")) {
      problems.push(`Other row ${row} needs both a name area and a count`);
    }
  }

  // Geometry: on the page, apart from each other, clear of the frame
  const all = def.fields.flatMap(fieldRects);
  const keepOut = [
    ...def.markers.map((m) => ({ name: `marker ${m.corner}`, rect: grow(m.rect, CARD_FRAME.quietZone) })),
    { name: "version code", rect: def.versionCodeRect },
  ];
  for (const a of all) {
    if (!inPage(a.rect, def.page)) problems.push(`${a.name} is off the page`);
    for (const k of keepOut) {
      if (overlaps(a.rect, k.rect)) problems.push(`${a.name} overlaps the ${k.name}`);
    }
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (overlaps(all[i].rect, all[j].rect)) problems.push(`${all[i].name} overlaps ${all[j].name}`);
    }
  }

  return problems;
}

/** The layout the app loads, which is the definition without its decorations */
export function toLayout(def: CardDefinition): CardLayout {
  const { decorations: _decorations, ...layout } = def;
  return layout;
}
