/**
 * Read every field on a dropout-filtered, aligned card.
 *
 * The models are passed in rather than imported. That keeps this code the
 * same in the browser worker, in Node tests, and when recognition is
 * switched off.
 */
import type { CardLayout, NumberField, Rect, TextField } from "../cards/schema";
import { normalizeDigit } from "../core/digitPrep";
import { proposeNumber, DEFAULT_DIGIT_THRESHOLDS, type DigitReading, type DigitThresholds, type Flag } from "../core/flags";
import { findInk } from "../core/ink";
import { cropGray, grayToRgba, toPx, PX_PER_MM, type Gray, type RGBA } from "../core/raster";
import { estimateTally } from "../core/tally";

/** Shrinks each digit box before reading it, so leftover box edges aren't read as ink, in mm */
export const BOX_INSET_MM = 0.45;
/** A box with less ink than this is blank, in mm² */
export const BOX_BLANK_MM2 = 0.6;
/** A tally area with less ink than this has no tally, in mm² */
export const TALLY_INKED_MM2 = 0.5;
/** A text area with less ink than this is blank, in mm² */
export const TEXT_BLANK_MM2 = 1.0;
/** Writing near the boxes but outside them, above this much, is flagged, in mm² */
export const OUTSIDE_INK_MM2 = 1.2;

/** One digit box's classification */
export interface DigitGuess {
  digit: number;
  p1: number;
  p2: number;
}

/** Classifies a batch of 28x28 digit inputs */
export type DigitClassifier = (inputs: Float32Array[]) => Promise<DigitGuess[]>;

/** Reads one line of handwriting */
export type TextReader = (crop: RGBA) => Promise<string>;

/**
 * Options for `readFields`.
 *
 * Attributes
 * ----------
 * classifyDigits : DigitClassifier | None
 *     The digit model. Without it, inked boxes are flagged for manual entry.
 * readText : TextReader | None
 *     The handwriting model. Without it, text fields are left for manual entry.
 * thresholds : DigitThresholds
 *     When a digit reading counts as uncertain.
 */
export interface ReadOptions {
  classifyDigits?: DigitClassifier;
  readText?: TextReader;
  thresholds?: DigitThresholds;
}

/**
 * What was read from one field.
 *
 * Attributes
 * ----------
 * fieldId : str
 * kind : "number" | "text"
 * value : str
 *     The proposed value. "" when nothing is proposed.
 * blank : bool
 *     Whether the volunteer wrote nothing in the field.
 * flags : list[Flag]
 *     Reasons a human should look at the field.
 * suggestion : str | None
 *     A value staff can accept with one key, such as a tally estimate.
 * needsConfirmation : bool
 *     True for every non-blank text field, whatever its reading.
 */
export interface FieldReading {
  fieldId: string;
  kind: "number" | "text";
  value: string;
  blank: boolean;
  flags: Flag[];
  suggestion?: string;
  needsConfirmation: boolean;
}

const grow = (r: Rect, dx: number, dy = dx): Rect => ({ x: r.x - dx, y: r.y - dy, w: r.w + 2 * dx, h: r.h + 2 * dy });

/** Ink area near a field's boxes but outside them, in mm² */
function outsideInkMm2(gray: Gray, f: NumberField): number {
  // Rows sit directly against the dark section bars, so the zone stays inside the row
  const top = Math.min(...f.boxes.map((b) => b.y)) - 0.3;
  const bottom = Math.max(...f.boxes.map((b) => b.y + b.h)) + 0.3;
  const last = f.boxes[f.boxes.length - 1];
  // Rows start right after their tally area. Header fields have a printed label to their left
  const left = f.tallyRect ? f.tallyRect.x + f.tallyRect.w + 0.3 : f.boxes[0].x - 1.0;
  const zone: Rect = { x: left, y: top, w: last.x + last.w + 1.5 - left, h: bottom - top };
  const zonePx = toPx(zone);
  const ink = findInk(cropGray(gray, zonePx));
  const inside = f.boxes.map((b) => toPx(grow(b, 0.35)));
  let px = 0;
  for (let i = 0; i < ink.mask.length; i++) {
    if (!ink.mask[i]) continue;
    const x = zonePx.x + (i % ink.width);
    const y = zonePx.y + Math.floor(i / ink.width);
    if (!inside.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) px++;
  }
  return px / (PX_PER_MM * PX_PER_MM);
}

/** The text area cropped tightly around its ink, ready for the handwriting model */
function textCrop(gray: Gray, f: TextField): { blank: boolean; crop: RGBA | null } {
  const area = toPx(f.textRect, 0.6);
  const region = cropGray(gray, area);
  const ink = findInk(region);
  if (ink.areaMm2 < TEXT_BLANK_MM2) return { blank: true, crop: null };
  const m = Math.round(PX_PER_MM);
  const x0 = Math.max(0, Math.min(...ink.blobs.map((b) => b.minX)) - m);
  const y0 = Math.max(0, Math.min(...ink.blobs.map((b) => b.minY)) - m);
  const x1 = Math.min(region.width, Math.max(...ink.blobs.map((b) => b.maxX)) + 1 + m);
  const y1 = Math.min(region.height, Math.max(...ink.blobs.map((b) => b.maxY)) + 1 + m);
  return { blank: false, crop: grayToRgba(cropGray(region, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })) };
}

/**
 * Read every field on a card.
 *
 * Digit boxes from the whole card are classified in one batch. Text fields
 * are read one at a time, because the handwriting model is much slower.
 *
 * Returns
 * -------
 * One reading per field, in layout order.
 */
export async function readFields(layout: CardLayout, gray: Gray, options: ReadOptions = {}): Promise<FieldReading[]> {
  const thresholds = options.thresholds ?? DEFAULT_DIGIT_THRESHOLDS;
  const numberFields = layout.fields.filter((f): f is NumberField => f.kind === "number");

  // Find ink in every box, and queue the inked ones for the digit model
  const queued: { field: number; box: number; input: Float32Array }[] = [];
  const boxes: DigitReading[][] = numberFields.map((f, fi) =>
    f.boxes.map((b, bi) => {
      const crop = cropGray(gray, toPx(b, BOX_INSET_MM));
      const ink = findInk(crop);
      if (ink.areaMm2 < BOX_BLANK_MM2) return { blank: true };
      queued.push({ field: fi, box: bi, input: normalizeDigit(ink.strength, ink.width, ink.height) });
      return { blank: false };
    }),
  );
  if (options.classifyDigits && queued.length) {
    const guesses = await options.classifyDigits(queued.map((q) => q.input));
    queued.forEach((q, i) => Object.assign(boxes[q.field][q.box], guesses[i]));
  }

  // Propose each number field from its boxes, tally, and surroundings
  const readings = new Map<string, FieldReading>();
  numberFields.forEach((f, fi) => {
    let tally: { inked: boolean; estimate: number | null } | undefined;
    if (f.tallyRect) {
      const ink = findInk(cropGray(gray, toPx(f.tallyRect, 0.4)));
      const inked = ink.areaMm2 >= TALLY_INKED_MM2;
      tally = { inked, estimate: inked ? estimateTally(ink) : null };
    }
    const p = proposeNumber(
      f,
      { boxes: boxes[fi], tally, outsideInk: outsideInkMm2(gray, f) >= OUTSIDE_INK_MM2, read: !!options.classifyDigits },
      thresholds,
    );
    readings.set(f.id, { fieldId: f.id, kind: "number", ...p, needsConfirmation: false });
  });

  // Text fields always need a human to confirm them
  for (const f of layout.fields) {
    if (f.kind !== "text") continue;
    const { blank, crop } = textCrop(gray, f);
    let value = "";
    const flags: Flag[] = [];
    if (!blank) {
      if (options.readText && crop) value = (await options.readText(crop)).trim();
      else flags.push({ code: "not-read", message: "Not read automatically. Enter the text" });
    }
    readings.set(f.id, { fieldId: f.id, kind: "text", value, blank, flags, needsConfirmation: !blank });
  }

  return layout.fields.map((f) => readings.get(f.id)!);
}
