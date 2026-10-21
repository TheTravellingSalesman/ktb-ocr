/**
 * Finding the volunteer's ink in a dropout-filtered image.
 *
 * After dropout the printed guides are gone, so anything dark enough is ink.
 * Ink is measured as a strength from 0 (paper) to 1 (full pen stroke), which
 * keeps light pencil distinguishable from specks and shadows.
 */
import { PX_PER_MM, type Gray } from "./raster";

/** Gray level treated as clean paper. Lighter pixels have no ink */
export const PAPER_LEVEL = 225;
/** Gray level treated as a full-strength stroke */
export const FULL_INK_LEVEL = 70;
/** Ink strength above which a pixel counts as ink */
export const INK_THRESHOLD = 0.35;
/** Connected ink smaller than this is a speck, not writing, in mm² */
export const SPECK_AREA_MM2 = 0.12;

/** Ink strength per pixel, 0 for paper and 1 for a full stroke */
export function inkStrength(img: Gray): Float32Array {
  const out = new Float32Array(img.data.length);
  const span = PAPER_LEVEL - FULL_INK_LEVEL;
  for (let i = 0; i < img.data.length; i++) {
    const v = (PAPER_LEVEL - img.data[i]) / span;
    out[i] = v <= 0 ? 0 : v >= 1 ? 1 : v;
  }
  return out;
}

/**
 * A connected blob of ink.
 *
 * Attributes
 * ----------
 * area : int
 *     Pixel count.
 * minX, maxX, minY, maxY : int
 *     Inclusive bounding box in the image the blob was found in.
 * pixels : Int32Array
 *     Indexes of the blob's pixels in that image.
 */
export interface Blob {
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pixels: Int32Array;
}

/** 8-connected blobs of ink in a 0/1 mask of the given size */
export function findBlobs(mask: Uint8Array, width: number, height: number): Blob[] {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const blobs: Blob[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const pixels: number[] = [];
    let minX = width, maxX = -1, minY = height, maxY = -1;
    while (top > 0) {
      const p = stack[--top];
      pixels.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
    }
    blobs.push({ area: pixels.length, minX, maxX, minY, maxY, pixels: Int32Array.from(pixels) });
  }
  return blobs;
}

/**
 * The ink in an image region, with specks removed.
 *
 * Attributes
 * ----------
 * strength : Float32Array
 *     Ink strength per pixel, zeroed where specks were removed.
 * mask : Uint8Array
 *     1 where a pixel is ink that belongs to a real blob.
 * blobs : list[Blob]
 *     The blobs that survived speck removal.
 * areaMm2 : float
 *     Total ink area in square millimetres.
 */
export interface Ink {
  width: number;
  height: number;
  strength: Float32Array;
  mask: Uint8Array;
  blobs: Blob[];
  areaMm2: number;
}

/** Find the ink in a dropout-filtered region, ignoring specks */
export function findInk(img: Gray, pxPerMm = PX_PER_MM): Ink {
  const strength = inkStrength(img);
  const raw = new Uint8Array(strength.length);
  for (let i = 0; i < strength.length; i++) raw[i] = strength[i] > INK_THRESHOLD ? 1 : 0;
  const minArea = SPECK_AREA_MM2 * pxPerMm * pxPerMm;
  const blobs = findBlobs(raw, img.width, img.height).filter((b) => b.area >= minArea);
  const mask = new Uint8Array(strength.length);
  let area = 0;
  for (const b of blobs) {
    for (const p of b.pixels) mask[p] = 1;
    area += b.area;
  }
  for (let i = 0; i < strength.length; i++) if (!mask[i] && strength[i] > INK_THRESHOLD) strength[i] = 0;
  return { width: img.width, height: img.height, strength, mask, blobs, areaMm2: area / (pxPerMm * pxPerMm) };
}
