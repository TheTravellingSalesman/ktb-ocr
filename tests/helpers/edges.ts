import { findGuideEdge, type Edge } from "../../src/core/guides";
import type { Rect } from "../../src/cards/schema";
import type { Raster } from "./pdf";

/** The app's guide finder, under the name the tests use */
export function findEdge(img: Raster, r: Rect, edge: Edge, pxPerMm: number, searchMm = 1.2, minScore = 0.6): number | null {
  return findGuideEdge(img, r, edge, pxPerMm, searchMm, minScore);
}
