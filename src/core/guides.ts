/**
 * Find the card's printed guide lines in an aligned colour image.
 *
 * Guides are printed in a light red tint. After alignment, every box edge
 * should sit within a fraction of a millimetre of where the layout puts it.
 * Checking that across the whole card catches bends and folds that the
 * corner markers alone can't reveal.
 */
import type { Rect } from "../cards/schema";
import type { RGBA } from "./raster";

/** Whether a pixel looks like the guide tint: clearly redder than it is green or blue */
function isGuide(img: RGBA, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
  const i = (y * img.width + x) * 4;
  const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
  return r > 90 && r - g > 25 && r - b > 15;
}

export type Edge = "top" | "bottom" | "left" | "right";

/**
 * Offset in mm from where the layout puts a box edge to where its printed line is.
 *
 * Neighbouring boxes and row lines are close by, so the qualifying line
 * nearest the expected edge wins.
 *
 * Returns
 * -------
 * The offset, or null if no printed line is found within `searchMm`.
 */
export function findGuideEdge(img: RGBA, r: Rect, edge: Edge, pxPerMm: number, searchMm = 1.2, minScore = 0.6): number | null {
  const horizontal = edge === "top" || edge === "bottom";
  const expected = { top: r.y, bottom: r.y + r.h, left: r.x, right: r.x + r.w }[edge];
  const [from, to] = horizontal ? [r.x + r.w * 0.25, r.x + r.w * 0.75] : [r.y + r.h * 0.25, r.y + r.h * 0.75];
  let nearest: number | null = null;
  for (let d = -searchMm; d <= searchMm + 1e-9; d += 1 / pxPerMm) {
    let hits = 0;
    let samples = 0;
    for (let t = from; t <= to; t += 1 / pxPerMm) {
      const px = Math.round((horizontal ? t : expected + d) * pxPerMm);
      const py = Math.round((horizontal ? expected + d : t) * pxPerMm);
      if (isGuide(img, px, py)) hits++;
      samples++;
    }
    if (hits / samples > minScore && (nearest === null || Math.abs(d) < Math.abs(nearest))) nearest = d;
  }
  return nearest;
}
