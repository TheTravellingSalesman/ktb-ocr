/**
 * Estimate how many tally marks are in a tally area.
 *
 * This is a weak signal by design. It's only used to raise flags and offer a
 * suggestion, never to set a value. Volunteers who write numbers in the tally
 * area produce nonsense here, which shows up as a disagreement flag the
 * reviewer resolves by looking at the crop.
 */
import type { Blob, Ink } from "./ink";

/** Slants tried when straightening a blob's strokes, as horizontal shift per pixel of height */
const SHEARS = [-0.35, -0.25, -0.15, -0.08, 0, 0.08, 0.15, 0.25, 0.35];
/** A column counts as part of an upright when this share of the blob's height is ink */
const UPRIGHT_FILL = 0.5;

/**
 * How much ink each column of a blob holds, after shearing it by `shear`.
 *
 * Shearing straightens slanted strokes, so each upright stacks into a few
 * columns instead of smearing across many.
 */
function columnProfile(blob: Blob, width: number, shear: number): number[] {
  const cy = (blob.minY + blob.maxY) / 2;
  const pad = Math.ceil(Math.abs(shear) * (blob.maxY - blob.minY + 1));
  const profile = new Array(blob.maxX - blob.minX + 1 + 2 * pad).fill(0);
  for (const p of blob.pixels) {
    const x = p % width;
    const y = (p - x) / width;
    const col = Math.round(x - shear * (y - cy)) - blob.minX + pad;
    profile[col]++;
  }
  return profile;
}

/** Widths of the runs of columns where the profile is at least `min` */
function peakWidths(profile: number[], min: number): number[] {
  const widths: number[] = [];
  let run = 0;
  for (const v of [...profile, 0]) {
    if (v >= min) run++;
    else if (run) {
      widths.push(run);
      run = 0;
    }
  }
  return widths;
}

/** The upright strokes in a blob, as the widths of their column runs */
function uprights(blob: Blob, width: number): number[] {
  const h = blob.maxY - blob.minY + 1;
  let best: number[] = [];
  let bestScore = -1;
  for (const shear of SHEARS) {
    const profile = columnProfile(blob, width, shear);
    // Straight uprights concentrate ink into tall, narrow peaks
    const score = profile.reduce((a, v) => a + v * v, 0);
    if (score > bestScore) {
      bestScore = score;
      best = peakWidths(profile, h * UPRIGHT_FILL);
    }
  }
  return best;
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/**
 * Estimate the tally count from the ink found in a tally area.
 *
 * Example
 * -------
 * A tally area holding "卌 卌 |||" is five blobs once specks are removed.
 *
 * - Each crossed group is one blob, because its diagonal joins the uprights.
 *   Summing ink down each column, uprights stand out as tall peaks. The
 *   diagonal adds only a little to each column it crosses. So each group
 *   shows 4 peaks, and joined uprights count with their diagonal as 5.
 * - Each trailing "|" is its own blob with one peak, counted as 1.
 * - Strokes drawn so close that they merge make one wide peak. When it's
 *   clearly wider than a typical peak, it counts as as many strokes as
 *   typical peaks would fit in its width.
 *
 * The estimate is 13.
 *
 * Returns
 * -------
 * The estimated count, or null when the area has no ink.
 */
export function estimateTally(ink: Ink): number | null {
  // Keep blobs tall or wide enough to be strokes
  const strokes = ink.blobs.filter((b) => b.maxY - b.minY + 1 >= ink.height * 0.3 || b.maxX - b.minX + 1 >= ink.height * 0.5);
  if (strokes.length === 0) return null;

  const peaks = strokes.map((b) => uprights(b, ink.width));
  const typical = Math.max(2, median(peaks.flat().filter((w) => w > 0)) ?? 2);

  let count = 0;
  for (const widths of peaks) {
    // Only peaks clearly wider than one stroke are split into several
    const n = widths.reduce((a, w) => a + (w > typical * 2.2 ? Math.round(w / typical) : 1), 0);
    if (n === 0) count += 1;
    else if (n === 1) count += 1;
    else count += n + Math.ceil(n / 4);
  }
  return count;
}

/** Whether a tally estimate and a written total disagree beyond the tolerance */
export function tallyDisagrees(estimate: number, total: number): boolean {
  return Math.abs(estimate - total) > Math.max(2, 0.2 * total);
}
