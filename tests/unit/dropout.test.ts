import { beforeAll, describe, expect, it } from "vitest";
import layoutJson from "../../src/cards/generated/ktb-card-v1.layout.json";
import type { CardLayout } from "../../src/cards/schema";
import { findInk } from "../../src/core/ink";
import { cropGray, toPx, type Gray } from "../../src/core/raster";
import { alignCard } from "../../src/pipeline/align";
import { dropout } from "../../src/pipeline/dropout";
import { BOX_INSET_MM } from "../../src/pipeline/fields";
import { renderPdfPage } from "../helpers/pdf";

const layout = layoutJson as CardLayout;

describe("dropout on a blank printed card", () => {
  let gray: Gray;

  beforeAll(async () => {
    const page = await renderPdfPage("public/cards/ktb-card-v1.pdf", 8);
    const aligned = await alignCard(page);
    if (!aligned.ok) throw new Error(aligned.code);
    gray = await dropout(aligned.aligned);
  });

  it("removes every digit box, tally area, and text area guide", () => {
    const inked: string[] = [];
    for (const f of layout.fields) {
      const regions = f.kind === "number" ? [...f.boxes, ...(f.tallyRect ? [f.tallyRect] : [])] : [f.textRect];
      for (const r of regions) {
        // A slightly larger crop than the reader uses, so the guide lines themselves are included
        const ink = findInk(cropGray(gray, toPx({ x: r.x - 0.3, y: r.y - 0.3, w: r.w + 0.6, h: r.h + 0.6 })));
        if (ink.areaMm2 > 0.05) inked.push(`${f.id}: ${ink.areaMm2.toFixed(2)} mm²`);
      }
    }
    expect(inked).toEqual([]);
  });

  it("keeps the alignment markers dark", () => {
    for (const m of layout.markers) {
      const ink = findInk(cropGray(gray, toPx(m.rect)));
      // Black cells make up at least the marker's border, 20 of 36 cells
      expect(ink.areaMm2 / (m.rect.w * m.rect.h)).toBeGreaterThan(0.5);
    }
  });

  it("crops digit boxes to clean, empty regions of the expected size", () => {
    const f = layout.fields.find((x) => x.id === "item.lids");
    if (f?.kind !== "number") throw new Error("item.lids missing");
    const crop = cropGray(gray, toPx(f.boxes[0], BOX_INSET_MM));
    expect(crop.width).toBe(Math.round((f.boxes[0].x + f.boxes[0].w - BOX_INSET_MM) * 6) - Math.round((f.boxes[0].x + BOX_INSET_MM) * 6));
    expect(Math.min(...crop.data)).toBeGreaterThan(200);
  });
});
