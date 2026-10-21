/**
 * Turn a digit box crop into the classifier's 28x28 input.
 *
 * This mirrors `normalize` in training/train_digits.py exactly. If one
 * changes, the other must too, or the model sees different input in the app
 * than it was trained on.
 */
import { INK_THRESHOLD } from "./ink";

export const DIGIT_SIZE = 28;
const FIT = 20;

/** Resize by bilinear sampling at output pixel centres */
function bilinearResize(src: Float32Array, inW: number, inH: number, outW: number, outH: number): Float32Array {
  const out = new Float32Array(outW * outH);
  for (let oy = 0; oy < outH; oy++) {
    const fy = Math.min(Math.max(((oy + 0.5) * inH) / outH - 0.5, 0), inH - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, inH - 1);
    const wy = fy - y0;
    for (let ox = 0; ox < outW; ox++) {
      const fx = Math.min(Math.max(((ox + 0.5) * inW) / outW - 0.5, 0), inW - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, inW - 1);
      const wx = fx - x0;
      const top = src[y0 * inW + x0] * (1 - wx) + src[y0 * inW + x1] * wx;
      const bottom = src[y1 * inW + x0] * (1 - wx) + src[y1 * inW + x1] * wx;
      out[oy * outW + ox] = top * (1 - wy) + bottom * wy;
    }
  }
  return out;
}

/** Python's round(), which rounds halves to even */
function roundHalfEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * MNIST-style normalization of an ink strength map to a 28x28 model input.
 *
 * Crops to the ink's bounding box, scales the longer side to 20 px, and
 * places the result so its centre of mass sits at the image centre.
 *
 * Returns
 * -------
 * 784 values in [0, 1], ink high. All zeros when there's no ink.
 */
export function normalizeDigit(ink: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(DIGIT_SIZE * DIGIT_SIZE);

  // Bounding box of the ink
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x] > INK_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return out;

  // Scale the longer side to FIT
  const h = maxY - minY + 1;
  const w = maxX - minX + 1;
  const crop = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) crop[y * w + x] = ink[(y + minY) * width + x + minX];
  const scale = FIT / Math.max(h, w);
  const nh = Math.max(1, roundHalfEven(h * scale));
  const nw = Math.max(1, roundHalfEven(w * scale));
  const small = bilinearResize(crop, w, h, nw, nh);

  // Centre of mass to the middle
  let total = 0, sy = 0, sx = 0;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const v = small[y * nw + x];
      total += v;
      sy += v * y;
      sx += v * x;
    }
  }
  if (total <= 0) return out;
  const oy = roundHalfEven(DIGIT_SIZE / 2 - 0.5 - sy / total);
  const ox = roundHalfEven(DIGIT_SIZE / 2 - 0.5 - sx / total);
  for (let y = 0; y < nh; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= DIGIT_SIZE) continue;
    for (let x = 0; x < nw; x++) {
      const tx = x + ox;
      if (tx >= 0 && tx < DIGIT_SIZE) out[ty * DIGIT_SIZE + tx] = small[y * nw + x];
    }
  }
  return out;
}
