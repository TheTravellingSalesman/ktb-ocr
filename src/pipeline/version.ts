/**
 * Read the card's version code and pick its layout.
 *
 * The QR code sits at the same template position on every card version, so
 * it's read from the aligned image first. If that fails, the whole original
 * image is scanned as a fallback.
 */
import jsQR from "jsqr";
import layoutV1 from "../cards/generated/ktb-card-v1.layout.json";
import { CARD_FRAME, type CardLayout } from "../cards/schema";
import { cropRgba, toPx, type RGBA } from "../core/raster";

/** Every card layout this app version can read, by version code */
export const LAYOUTS: Record<string, CardLayout> = Object.fromEntries(
  [layoutV1 as CardLayout].map((l) => [l.versionCode, l]),
);

/** Longest side the whole-image fallback scans at */
const FALLBACK_MAX_SIDE = 1600;

/** Downscale an RGBA image by nearest neighbour so its longest side is at most `max` */
function shrink(img: RGBA, max: number): RGBA {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  if (s === 1) return img;
  const w = Math.round(img.width * s);
  const h = Math.round(img.height * s);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / s));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / s));
      out.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

function decode(img: RGBA): string | null {
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

/**
 * Read the version code from an aligned card, falling back to the original image.
 *
 * Returns
 * -------
 * The decoded text, or null when no QR code could be read.
 */
export function readVersionCode(aligned: RGBA, original?: RGBA): string | null {
  // A little margin around the printed code absorbs small alignment error
  const r = CARD_FRAME.versionCodeRect;
  const crop = cropRgba(aligned, toPx({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }));
  return decode(crop) ?? (original ? decode(shrink(original, FALLBACK_MAX_SIDE)) : null);
}

/** The layout for a version code, or null when this app doesn't know it */
export function layoutFor(versionCode: string | null): CardLayout | null {
  return (versionCode && LAYOUTS[versionCode]) || null;
}
