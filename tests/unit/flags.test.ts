import { describe, expect, it } from "vitest";
import { proposeNumber, type DigitReading } from "../../src/core/flags";

const d = (digit: number, p1 = 0.99, p2 = 0.005): DigitReading => ({ blank: false, digit, p1, p2 });
const blank: DigitReading = { blank: true };
const integer = { format: "integer" as const };
const codes = (p: { flags: { code: string }[] }) => p.flags.map((f) => f.code);

describe("number field proposals", () => {
  it("proposes blank for an untouched row, with no flags", () => {
    const p = proposeNumber(integer, { boxes: [blank, blank, blank], tally: { inked: false, estimate: null }, outsideInk: false, read: true });
    expect(p).toEqual({ value: "", blank: true, flags: [] });
  });

  it("joins non-blank boxes left to right", () => {
    const p = proposeNumber(integer, { boxes: [d(1), d(7), blank], tally: { inked: true, estimate: 17 }, outsideInk: false, read: true });
    expect(p.value).toBe("17");
    expect(p.flags).toEqual([]);
  });

  it("keeps the printed decimal point", () => {
    const p = proposeNumber({ format: "decimal", decimalAfter: 1 }, { boxes: [blank, d(2), d(5)], outsideInk: false, read: true });
    expect(p.value).toBe("2.5");
  });

  it("reads a fraction with nothing before the decimal point", () => {
    const p = proposeNumber({ format: "decimal", decimalAfter: 0 }, { boxes: [blank, d(5), blank], outsideInk: false, read: true });
    expect(p.value).toBe("0.5");
  });

  it("formats a date and flags an impossible one", () => {
    const boxes = [d(0), d(6), d(1), d(4), d(2), d(6)];
    expect(proposeNumber({ format: "date" }, { boxes, outsideInk: false, read: true }).value).toBe("06/14/26");
    const bad = proposeNumber({ format: "date" }, { boxes: [d(1), d(4), d(0), d(6), d(2), d(6)], outsideInk: false, read: true });
    expect(codes(bad)).toContain("invalid-date");
  });

  it("flags tally without a total and suggests the estimate", () => {
    const p = proposeNumber(integer, { boxes: [blank, blank, blank], tally: { inked: true, estimate: 12 }, outsideInk: false, read: true });
    expect(codes(p)).toEqual(["tally-no-total"]);
    expect(p.suggestion).toBe("12");
    expect(p.blank).toBe(false);
  });

  it("flags a tally that disagrees with the total", () => {
    const p = proposeNumber(integer, { boxes: [d(2), d(1), blank], tally: { inked: true, estimate: 12 }, outsideInk: false, read: true });
    expect(codes(p)).toEqual(["tally-total-disagree"]);
    expect(p.flags[0].message).toContain("12");
    expect(p.flags[0].message).toContain("21");
  });

  it("tolerates small tally miscounts", () => {
    const p = proposeNumber(integer, { boxes: [d(4), d(0), blank], tally: { inked: true, estimate: 35 }, outsideInk: false, read: true });
    expect(p.flags).toEqual([]);
  });

  it("flags a low-confidence digit", () => {
    const p = proposeNumber(integer, { boxes: [d(7, 0.55, 0.4), blank, blank], outsideInk: false, read: true });
    expect(codes(p)).toEqual(["low-confidence"]);
  });

  it("flags a blank box between digits", () => {
    const p = proposeNumber(integer, { boxes: [d(1), blank, d(3)], outsideInk: false, read: true });
    expect(codes(p)).toEqual(["gap-between-boxes"]);
  });

  it("flags writing outside the boxes, even when the boxes are empty", () => {
    const p = proposeNumber(integer, { boxes: [blank, blank, blank], tally: { inked: false, estimate: null }, outsideInk: true, read: true });
    expect(codes(p)).toEqual(["outside-boxes"]);
    expect(p.blank).toBe(false);
  });

  it("asks for manual entry when recognition is off", () => {
    const p = proposeNumber(integer, { boxes: [d(1), blank, blank], outsideInk: false, read: false });
    expect(codes(p)).toEqual(["not-read"]);
    expect(p.value).toBe("");
  });
});
