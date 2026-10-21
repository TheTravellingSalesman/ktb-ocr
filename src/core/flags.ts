/**
 * Turn what was read from a field into a proposed value and flags.
 *
 * Fields are flagged from disagreement between independent signals, not from
 * the digit model's confidence alone. Every flag carries a reason a reviewer
 * can act on.
 */
import { tallyDisagrees } from "./tally";
import type { NumberField } from "../cards/schema";

export type FlagCode =
  | "low-confidence"
  | "tally-total-disagree"
  | "tally-no-total"
  | "gap-between-boxes"
  | "outside-boxes"
  | "invalid-date"
  | "not-read";

/** Why a field needs a human to look at it */
export interface Flag {
  code: FlagCode;
  message: string;
}

/**
 * What was read from one digit box.
 *
 * Attributes
 * ----------
 * blank : bool
 *     Whether the box has no ink.
 * digit : int | None
 *     The most likely digit, when the box isn't blank and was read.
 * p1, p2 : float | None
 *     Probabilities of the most and second-most likely digits.
 */
export interface DigitReading {
  blank: boolean;
  digit?: number;
  p1?: number;
  p2?: number;
}

/**
 * Everything the recognizer found for one number field.
 *
 * Attributes
 * ----------
 * boxes : list[DigitReading]
 *     One reading per digit box, left to right.
 * tally : {inked: bool, estimate: int | None} | None
 *     The tally area's ink and count estimate. None for fields without one.
 * outsideInk : bool
 *     Whether there's significant writing near the boxes but outside them.
 * read : bool
 *     False when digit recognition is switched off, so inked boxes have no
 *     digits.
 */
export interface NumberEvidence {
  boxes: DigitReading[];
  tally?: { inked: boolean; estimate: number | null };
  outsideInk: boolean;
  read: boolean;
}

/** The recognizer's proposal for a number field */
export interface NumberProposal {
  /** The proposed value as staff will see it, "" when nothing is proposed */
  value: string;
  /** True when the volunteer wrote nothing in the boxes or the tally area */
  blank: boolean;
  flags: Flag[];
  /** A value staff can accept with one key, such as the tally estimate */
  suggestion?: string;
}

/**
 * Thresholds for flagging uncertain digit readings.
 *
 * Attributes
 * ----------
 * minProbability : float
 *     A digit read with less probability than this is flagged.
 * minMargin : float
 *     A digit whose top two probabilities are closer than this is flagged.
 */
export interface DigitThresholds {
  minProbability: number;
  minMargin: number;
}

export const DEFAULT_DIGIT_THRESHOLDS: DigitThresholds = { minProbability: 0.8, minMargin: 0.5 };

/** Indexes of the non-blank boxes with a blank box between them, in one run of boxes */
function hasGap(boxes: DigitReading[]): boolean {
  const filled = boxes.map((b, i) => (b.blank ? -1 : i)).filter((i) => i >= 0);
  return filled.length > 1 && filled[filled.length - 1] - filled[0] + 1 !== filled.length;
}

const digitsOf = (boxes: DigitReading[]) =>
  boxes
    .filter((b) => !b.blank)
    .map((b) => String(b.digit))
    .join("");

/** Check a MM/DD/YY date for a plausible month and day */
function validDate(mm: number, dd: number): boolean {
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

/**
 * Propose a value for a number field and flag it if needed.
 *
 * Example
 * -------
 * An item row with tally "卌 卌 ||" and boxes ["2", "1", blank]:
 *
 * - The boxes join to "21". Blank boxes are skipped.
 * - The tally estimate is 12, which differs from 21 by more than
 *   max(2, 20% of 21). The field is flagged "tally-total-disagree".
 * - The estimate is offered as the suggestion.
 *
 * Returns
 * -------
 * The proposed value, whether the field is blank, its flags, and a suggestion
 * when there is one.
 */
export function proposeNumber(
  field: Pick<NumberField, "format" | "decimalAfter">,
  e: NumberEvidence,
  thresholds: DigitThresholds = DEFAULT_DIGIT_THRESHOLDS,
): NumberProposal {
  const flags: Flag[] = [];
  const add = (code: FlagCode, message: string) => flags.push({ code, message });
  const boxesInked = e.boxes.some((b) => !b.blank);
  const tallyInked = e.tally?.inked ?? false;
  const estimate = e.tally?.estimate ?? null;
  const suggestion = tallyInked && estimate !== null ? String(estimate) : undefined;

  if (e.outsideInk) add("outside-boxes", "Writing outside the boxes");

  // Nothing in the boxes
  if (!boxesInked) {
    if (tallyInked) {
      add("tally-no-total", estimate !== null ? `Tally marks (about ${estimate}) but no total written` : "Tally marks but no total written");
      return { value: "", blank: false, flags, suggestion };
    }
    return { value: "", blank: !e.outsideInk, flags };
  }

  // Inked boxes that weren't read, because recognition is off
  if (!e.read) {
    add("not-read", "Not read automatically. Enter the value");
    return { value: "", blank: false, flags, suggestion };
  }

  for (const [i, b] of e.boxes.entries()) {
    if (b.blank) continue;
    if ((b.p1 ?? 0) < thresholds.minProbability || (b.p1 ?? 0) - (b.p2 ?? 0) < thresholds.minMargin) {
      add("low-confidence", `Unsure about the digit in box ${i + 1}`);
      break;
    }
  }

  let value: string;
  if (field.format === "date") {
    const digits = digitsOf(e.boxes);
    if (digits.length !== 6 || !validDate(Number(digits.slice(0, 2)), Number(digits.slice(2, 4)))) {
      add("invalid-date", "Not a complete, valid date");
      value = digits;
    } else {
      value = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 6)}`;
    }
  } else if (field.format === "decimal" && field.decimalAfter !== undefined) {
    const whole = e.boxes.slice(0, field.decimalAfter + 1);
    const frac = e.boxes.slice(field.decimalAfter + 1);
    if (hasGap(whole) || hasGap(frac)) add("gap-between-boxes", "A blank box between digits");
    const w = digitsOf(whole);
    const f = digitsOf(frac);
    value = f ? `${w || "0"}.${f}` : w;
  } else {
    if (hasGap(e.boxes)) add("gap-between-boxes", "A blank box between digits");
    value = digitsOf(e.boxes);
  }

  // Cross-check the written total against the tally
  if (field.format === "integer" && tallyInked && estimate !== null && tallyDisagrees(estimate, Number(value))) {
    add("tally-total-disagree", `Tally (about ${estimate}) and total (${value}) disagree`);
  }

  return { value, blank: false, flags, suggestion };
}
