import { beforeAll, describe, expect, it } from "vitest";
import layout from "../../src/cards/generated/ktb-card-v1.layout.json";
import type { CardLayout } from "../../src/cards/schema";
import { renderPdfPage, type Raster } from "../helpers/pdf";
import { findEdge } from "../helpers/edges";
import { alignCard } from "../../src/pipeline/align";
import { readVersionCode } from "../../src/pipeline/version";

const PX_PER_MM = 8;
/** How far a printed box edge may sit from where the layout says, in mm */
const TOLERANCE_MM = 0.3;

describe("generated card PDF", () => {
  let img: Raster;
  const def = layout as CardLayout;

  beforeAll(async () => {
    img = await renderPdfPage("public/cards/ktb-card-v1.pdf", PX_PER_MM);
  });

  it("has the page size the layout describes", () => {
    expect(img.width).toBeCloseTo(def.page.width * PX_PER_MM, -1);
    expect(img.height).toBeCloseTo(def.page.height * PX_PER_MM, -1);
  });

  it("prints every digit box where the layout puts it", () => {
    const misplaced: string[] = [];
    for (const f of def.fields) {
      if (f.kind !== "number") continue;
      f.boxes.forEach((box, i) => {
        for (const edge of ["top", "bottom", "left", "right"] as const) {
          const off = findEdge(img, box, edge, PX_PER_MM);
          if (off === null || Math.abs(off) > TOLERANCE_MM) {
            misplaced.push(`${f.id} box ${i} ${edge}: ${off === null ? "not found" : `${off.toFixed(2)} mm off`}`);
          }
        }
      });
    }
    expect(misplaced).toEqual([]);
  });

  it("prints four markers and a version code the app can decode", async () => {
    const aligned = await alignCard(img);
    expect(aligned.ok).toBe(true);
    if (!aligned.ok) return;
    expect(aligned.markersFound.sort()).toEqual(["bl", "br", "tl", "tr"]);
    expect(readVersionCode(aligned.aligned)).toBe(def.versionCode);
  });
});
