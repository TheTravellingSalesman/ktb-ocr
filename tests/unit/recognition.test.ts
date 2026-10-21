import { beforeAll, describe, expect, it } from "vitest";
import type { NumberField } from "../../src/cards/schema";
import { tallyDisagrees } from "../../src/core/tally";
import { processCard } from "../../src/pipeline/process";
import type { FieldReading } from "../../src/pipeline/fields";
import { loadFixture, MANIFEST } from "../helpers/fixtures";
import { digitClassifier } from "../helpers/models";
import type { FixtureTruth } from "../../tools/make-fixtures";

interface Read {
  truth: FixtureTruth;
  fields: Map<string, FieldReading>;
  numberFields: NumberField[];
}

const readable = MANIFEST.filter((f) => f.expect.status === "read");
const results: Read[] = [];

beforeAll(async () => {
  const classifyDigits = await digitClassifier();
  for (const truth of readable) {
    const r = await processCard(await loadFixture(truth.name), { classifyDigits });
    if (r.status !== "read") throw new Error(`${truth.name} was rejected: ${r.code}`);
    results.push({
      truth,
      fields: new Map(r.fields.map((f) => [f.fieldId, f])),
      numberFields: r.layout.fields.filter((f): f is NumberField => f.kind === "number"),
    });
  }
}, 600_000);

describe("recognition on synthetic cards", () => {
  it("detects blank and written fields", () => {
    let right = 0;
    let total = 0;
    const wrong: string[] = [];
    for (const r of results) {
      for (const f of r.numberFields) {
        const t = r.truth.numbers[f.id];
        const truthBlank = !t || (t.written === "" && t.tally === null && !t.outside);
        const got = r.fields.get(f.id)!.blank;
        total++;
        if (got === truthBlank) right++;
        else wrong.push(`${r.truth.name} ${f.id}: expected ${truthBlank ? "blank" : "written"}`);
      }
    }
    console.log(`blank detection: ${right}/${total} (${((100 * right) / total).toFixed(2)}%)`, wrong.slice(0, 10));
    expect(right / total).toBeGreaterThanOrEqual(0.99);
  });

  it("reads written values, and flags the ones it gets wrong", () => {
    let right = 0;
    let total = 0;
    let wrongUnflagged = 0;
    const wrong: string[] = [];
    for (const r of results) {
      for (const [id, t] of Object.entries(r.truth.numbers)) {
        if (!t.written || t.expectFlags.length) continue;
        const got = r.fields.get(id)!;
        total++;
        if (got.value === t.value) right++;
        else {
          if (got.flags.length === 0) wrongUnflagged++;
          wrong.push(`${r.truth.name} ${id}: ${t.value} read as ${got.value || "∅"} [${got.flags.map((f) => f.code)}]`);
        }
      }
    }
    console.log(`values: ${right}/${total} (${((100 * right) / total).toFixed(1)}%), wrong and unflagged: ${wrongUnflagged}`, wrong);
    expect(right / total).toBeGreaterThanOrEqual(0.9);
    expect(wrongUnflagged / total).toBeLessThanOrEqual(0.03);
  });

  it("reads multi-digit and fractional header values", () => {
    for (const r of results) {
      for (const id of ["header.duration", "header.pounds", "header.date"]) {
        const t = r.truth.numbers[id];
        if (!t) continue;
        const got = r.fields.get(id)!;
        // A wrong read is acceptable only when flagged for review
        if (got.value !== t.value) expect(got.flags.length, `${r.truth.name} ${id}: ${t.value} vs ${got.value}`).toBeGreaterThan(0);
      }
    }
  });

  it("estimates tallies within tolerance", () => {
    let close = 0;
    let total = 0;
    const off: string[] = [];
    for (const r of results) {
      for (const [id, t] of Object.entries(r.truth.numbers)) {
        if (t.tally === null) continue;
        total++;
        const est = Number(r.fields.get(id)!.suggestion ?? NaN);
        if (!Number.isNaN(est) && !tallyDisagrees(est, t.tally)) close++;
        else off.push(`${r.truth.name} ${id}: ${t.tally} estimated ${est}`);
      }
    }
    console.log(`tally: ${close}/${total} within tolerance`, off);
    expect(close / total).toBeGreaterThanOrEqual(0.85);
  });

  it("raises the expected flag on each special case", () => {
    const r = results.find((x) => x.truth.name === "special-cases")!;
    for (const [id, t] of Object.entries(r.truth.numbers)) {
      for (const code of t.expectFlags) {
        expect(r.fields.get(id)!.flags.map((f) => f.code), id).toContain(code);
      }
    }
  });

  it("proposes every field of a blank card as blank", () => {
    const r = results.find((x) => x.truth.name === "blank")!;
    const notBlank = [...r.fields.values()].filter((f) => !f.blank).map((f) => f.fieldId);
    expect(notBlank).toEqual([]);
  });
});
