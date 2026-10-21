/**
 * Remove the printed guides and even out the lighting.
 *
 * The card's boxes and lines are printed in a light red tint, which is
 * nearly white in the red channel. Black pen, blue pen, and pencil stay dark
 * there. Dividing by a smooth estimate of the paper brightness corrects
 * shadows and colour casts, so the paper ends up white across the whole card.
 */
import { PX_PER_MM, type Gray, type RGBA } from "../core/raster";
import { loadCv } from "./cv";

/** Ink strokes thinner than this are erased when estimating the paper, in mm */
const STROKE_MAX_MM = 2.5;
/** Smoothing of the paper estimate, in mm */
const PAPER_BLUR_MM = 6;

/**
 * Dropout-filter an aligned card.
 *
 * Returns
 * -------
 * A gray image where clean paper is 255, guides are gone, and the
 * volunteer's writing is dark.
 */
export async function dropout(aligned: RGBA): Promise<Gray> {
  const cv = await loadCv();
  const src = cv.matFromImageData(aligned);
  const channels = new cv.MatVector();
  cv.split(src, channels);
  const red = channels.get(0);

  // Estimate the paper brightness by erasing thin strokes, then smoothing
  const paper = new cv.Mat();
  const k = Math.round(STROKE_MAX_MM * PX_PER_MM) | 1;
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
  cv.dilate(red, paper, kernel);
  const b = Math.round(PAPER_BLUR_MM * PX_PER_MM) | 1;
  cv.GaussianBlur(paper, paper, new cv.Size(b, b), 0);

  // Divide out the paper so it becomes white everywhere
  const out = new cv.Mat();
  cv.divide(red, paper, out, 255);
  const result: Gray = { width: out.cols, height: out.rows, data: new Uint8ClampedArray(out.data) };
  [src, channels, red, paper, kernel, out].forEach((m) => m.delete());
  return result;
}
