/**
 * Plain image types and pixel helpers.
 *
 * The recognition core works on these instead of canvas or OpenCV types, so
 * it runs the same in a browser worker and in Node tests.
 */
import type { Rect } from "../cards/schema";

/** An RGBA image, laid out like the browser's `ImageData` */
export interface RGBA {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** A single-channel 8-bit image, 255 for white paper */
export interface Gray {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** A pixel rectangle with integer bounds */
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Aligned card images are rendered at this many pixels per millimetre */
export const PX_PER_MM = 6;

/** Convert a millimetre rectangle to pixels, shrunk by `insetMm` on every side */
export function toPx(r: Rect, insetMm = 0, pxPerMm = PX_PER_MM): PxRect {
  const x0 = Math.round((r.x + insetMm) * pxPerMm);
  const y0 = Math.round((r.y + insetMm) * pxPerMm);
  const x1 = Math.round((r.x + r.w - insetMm) * pxPerMm);
  const y1 = Math.round((r.y + r.h - insetMm) * pxPerMm);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Copy a region out of a gray image. Pixels outside the image read as white */
export function cropGray(img: Gray, r: PxRect): Gray {
  const out = new Uint8ClampedArray(r.w * r.h).fill(255);
  for (let y = 0; y < r.h; y++) {
    const sy = r.y + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x;
      if (sx < 0 || sx >= img.width) continue;
      out[y * r.w + x] = img.data[sy * img.width + sx];
    }
  }
  return { width: r.w, height: r.h, data: out };
}

/** Copy a region out of an RGBA image. Pixels outside the image read as white */
export function cropRgba(img: RGBA, r: PxRect): RGBA {
  const out = new Uint8ClampedArray(r.w * r.h * 4).fill(255);
  for (let y = 0; y < r.h; y++) {
    const sy = r.y + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x;
      if (sx < 0 || sx >= img.width) continue;
      out.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * r.w + x) * 4);
    }
  }
  return { width: r.w, height: r.h, data: out };
}

/** Expand a gray image to opaque RGBA */
export function grayToRgba(img: Gray): RGBA {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0; i < img.data.length; i++) {
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = img.data[i];
    out[i * 4 + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}
