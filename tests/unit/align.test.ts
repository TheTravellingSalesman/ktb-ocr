import { describe, expect, it } from "vitest";
import layoutJson from "../../src/cards/generated/ktb-card-v1.layout.json";
import type { CardLayout } from "../../src/cards/schema";
import { alignCard, verifyAlignment } from "../../src/pipeline/align";
import { processCard } from "../../src/pipeline/process";
import { layoutFor, readVersionCode } from "../../src/pipeline/version";
import { PX_PER_MM } from "../../src/core/raster";
import { findEdge } from "../helpers/edges";
import { loadFixture, MANIFEST } from "../helpers/fixtures";

const layout = layoutJson as CardLayout;
/** How far a box edge may land from its layout position after alignment, in mm */
const ALIGN_TOLERANCE_MM = 0.6;

const readable = MANIFEST.filter((f) => f.expect.status === "read");
const alignable = MANIFEST.filter((f) => f.expect.status === "read" || (f.expect.status === "rejected" && f.expect.code === "unknown-version"));
const misframed = MANIFEST.filter((f) => f.expect.status === "rejected" && f.expect.code !== "unknown-version");

describe("card alignment", () => {
  it.each(alignable.map((f) => [f.name, f.description]))("aligns %s (%s) so boxes sit on their printed positions", async (name) => {
    const result = await alignCard(await loadFixture(name));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(verifyAlignment(result.aligned, layout)).toBe(true);

    const offsets: number[] = [];
    let missing = 0;
    for (const f of layout.fields) {
      if (f.kind !== "number") continue;
      for (const box of f.boxes) {
        for (const edge of ["top", "left", "bottom", "right"] as const) {
          const off = findEdge(result.aligned, box, edge, PX_PER_MM, 1.5, 0.4);
          if (off === null) missing++;
          else offsets.push(Math.abs(off));
        }
      }
    }
    offsets.sort((a, b) => a - b);
    const p95 = offsets[Math.floor(offsets.length * 0.95)];
    // Handwriting covers some box edges, so a few can't be found
    expect(missing / (offsets.length + missing)).toBeLessThan(0.1);
    expect(p95).toBeLessThanOrEqual(ALIGN_TOLERANCE_MM);
  });

  it.each(misframed.map((f) => [f.name, (f.expect as { code: string }).code]))("rejects %s as %s", async (name, code) => {
    const result = await processCard(await loadFixture(name));
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.code).toBe(code);
  });
});

describe("version code", () => {
  it.each(readable.map((f) => [f.name]))("reads the version from %s", async (name) => {
    const original = await loadFixture(name);
    const result = await alignCard(original);
    if (!result.ok) throw new Error(`alignment failed: ${result.code}`);
    const code = readVersionCode(result.aligned, original);
    expect(code).toBe("KTBCARD:1");
    expect(layoutFor(code)?.version).toBe("1");
  });

  it.each([["missing-qr"], ["unknown-version"]])("finds no known layout for %s", async (name) => {
    const original = await loadFixture(name);
    const result = await alignCard(original);
    if (!result.ok) throw new Error(`alignment failed: ${result.code}`);
    expect(layoutFor(readVersionCode(result.aligned, original))).toBeNull();
  });
});
