import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDigit } from "../../src/core/digitPrep";

interface Case {
  width: number;
  height: number;
  ink: number[];
  expected: number[];
}

const cases: Case[] = JSON.parse(readFileSync("tests/fixtures/digitprep-parity.json", "utf8"));

describe("digit preprocessing", () => {
  it.each(cases.map((c, i) => [i, c]))("matches the Python training code on case %i", (_i, c) => {
    const out = normalizeDigit(Float32Array.from(c.ink), c.width, c.height);
    const worst = Math.max(...Array.from(out, (v, i) => Math.abs(v - c.expected[i])));
    expect(worst).toBeLessThan(1e-4);
  });

  it("returns all zeros for an empty box", () => {
    expect(Math.max(...normalizeDigit(new Float32Array(32 * 32), 32, 32))).toBe(0);
  });
});
