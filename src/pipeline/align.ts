/**
 * Align a card photo or scan onto the card template.
 *
 * The four corner markers each have their own ID, so finding them tells us
 * both where the card is and which way up it is. A homography fitted to all
 * sixteen marker corners flattens the card, which corrects rotation,
 * perspective, and scale in one step.
 */
import { CARD_FRAME, frameMarkers, type CardLayout, type Corner } from "../cards/schema";
import { findGuideEdge } from "../core/guides";
import { PX_PER_MM, type RGBA } from "../core/raster";
import { loadCv, type CV } from "./cv";

/** Longest side marker detection runs at. Larger images are scaled down first */
const DETECT_MAX_SIDE = 2000;
/** Largest marker-corner reprojection error accepted, in mm */
const MAX_REPROJECTION_MM = 1.2;
/** Smallest marker side, in source pixels, that still reads reliably */
const MIN_MARKER_PX = 18;

export type RejectCode = "no-card" | "not-in-frame" | "alignment-failed" | "too-small" | "unknown-version";

/** Why a card was rejected, in words staff can act on */
export const REJECT_MESSAGES: Record<RejectCode, string> = {
  "no-card": "No card found. Make sure the whole card is in the photo.",
  "not-in-frame": "Card not fully in frame. All four corner squares must be visible.",
  "alignment-failed": "The card couldn't be lined up. It may be folded or curled. Flatten it and retake the photo.",
  "too-small": "The card is too small in the image to read. Take the photo closer.",
  "unknown-version": "Could not read card version. The QR code at the top is missing, damaged, or from an unknown card.",
};

/**
 * The outcome of aligning one image.
 *
 * Attributes
 * ----------
 * ok : bool
 * aligned : RGBA
 *     The card warped onto the template at `PX_PER_MM`. Present when ok.
 * reprojectionMm : float
 *     Largest marker-corner error after alignment, in mm.
 * code : RejectCode
 *     Why alignment failed. Present when not ok.
 * markersFound : list[Corner]
 *     Which corner markers were found.
 */
export type AlignResult =
  | { ok: true; aligned: RGBA; reprojectionMm: number; markersFound: Corner[] }
  | { ok: false; code: RejectCode; markersFound: Corner[] };

interface Detection {
  id: number;
  corners: number[]; // x0,y0,...,x3,y3 in source pixels, the marker's own TL,TR,BR,BL
  side: number;
}

/** Find the card's corner markers in a gray Mat at one scale, in source pixel coordinates */
function detectAtScale(cv: CV, gray: CV, scale: number): Detection[] {
  const small = new cv.Mat();
  if (scale < 1) cv.resize(gray, small, new cv.Size(Math.round(gray.cols * scale), Math.round(gray.rows * scale)), 0, 0, cv.INTER_AREA);
  else gray.copyTo(small);

  const dict = cv.getPredefinedDictionary(cv.DICT_4X4_50);
  const params = new cv.aruco_DetectorParameters();
  const refine = new cv.aruco_RefineParameters(10, 3, true);
  const detector = new cv.aruco_ArucoDetector(dict, params, refine);
  const corners = new cv.MatVector();
  const ids = new cv.Mat();
  const rejected = new cv.MatVector();
  try {
    detector.detectMarkers(small, corners, ids, rejected);
    const wanted = new Set(Object.values(CARD_FRAME.markerIds));
    const found: Detection[] = [];
    for (let i = 0; i < ids.total(); i++) {
      const id = ids.data32S[i];
      if (!wanted.has(id)) continue;
      const pts = Array.from(corners.get(i).data32F as Float32Array).map((v) => v / scale);
      found.push({ id, corners: pts, side: Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) });
    }
    return found;
  } finally {
    [small, corners, ids, rejected, detector, refine, params, dict].forEach((m) => m.delete?.());
  }
}

/**
 * Find the card's corner markers, in source pixel coordinates.
 *
 * Large images are searched at a reduced size first, which is faster. If
 * that misses any marker, the full-size image is searched too. If an ID is
 * somehow seen twice, the larger detection wins.
 */
function detectMarkers(cv: CV, gray: CV): Detection[] {
  const longest = Math.max(gray.cols, gray.rows);
  const scales = longest > DETECT_MAX_SIDE ? [DETECT_MAX_SIDE / longest, 1] : [1];
  const byId = new Map<number, Detection>();
  for (const scale of scales) {
    for (const d of detectAtScale(cv, gray, scale)) {
      if (!byId.has(d.id) || byId.get(d.id)!.side < d.side) byId.set(d.id, d);
    }
    if (byId.size === 4) break;
  }
  return [...byId.values()];
}

/**
 * Align an image of a card onto the template.
 *
 * Returns
 * -------
 * The aligned card, or a rejection code when the card can't be trusted to
 * line up. A rejected card never produces field values.
 */
export async function alignCard(image: RGBA): Promise<AlignResult> {
  const cv = await loadCv();
  const markers = frameMarkers();
  const cornerOf = new Map(markers.map((m) => [m.id, m.corner]));

  const src = cv.matFromImageData(image);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  try {
    // Find the markers
    const found = detectMarkers(cv, gray);
    const markersFound = found.map((d) => cornerOf.get(d.id)!);
    if (found.length === 0) return { ok: false, code: "no-card", markersFound };
    if (found.length < 4) return { ok: false, code: "not-in-frame", markersFound };
    if (Math.min(...found.map((d) => d.side)) < MIN_MARKER_PX) return { ok: false, code: "too-small", markersFound };

    // Fit the homography from all 16 marker corners to their template positions
    const srcPts: number[] = [];
    const dstPts: number[] = [];
    for (const d of found) {
      const r = markers.find((m) => m.id === d.id)!.rect;
      const template = [r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h].map((v) => v * PX_PER_MM);
      srcPts.push(...d.corners);
      dstPts.push(...template);
    }
    const srcMat = cv.matFromArray(16, 1, cv.CV_32FC2, srcPts);
    const dstMat = cv.matFromArray(16, 1, cv.CV_32FC2, dstPts);
    const H = cv.findHomography(srcMat, dstMat, 0);
    srcMat.delete();
    dstMat.delete();
    if (H.empty()) {
      H.delete();
      return { ok: false, code: "alignment-failed", markersFound };
    }

    // Verify the fit. A folded or curled card can't be flattened by one homography
    const h = H.data64F as Float64Array;
    let worst = 0;
    for (let i = 0; i < 16; i++) {
      const [x, y] = [srcPts[i * 2], srcPts[i * 2 + 1]];
      const w = h[6] * x + h[7] * y + h[8];
      const px = (h[0] * x + h[1] * y + h[2]) / w;
      const py = (h[3] * x + h[4] * y + h[5]) / w;
      worst = Math.max(worst, Math.hypot(px - dstPts[i * 2], py - dstPts[i * 2 + 1]) / PX_PER_MM);
    }
    if (!(worst <= MAX_REPROJECTION_MM)) {
      H.delete();
      return { ok: false, code: "alignment-failed", markersFound };
    }

    // Warp the full-resolution image onto the template
    const width = Math.round(CARD_FRAME.page.width * PX_PER_MM);
    const height = Math.round(CARD_FRAME.page.height * PX_PER_MM);
    const out = new cv.Mat();
    cv.warpPerspective(src, out, H, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    const aligned: RGBA = { width, height, data: new Uint8ClampedArray(out.data) };
    out.delete();
    H.delete();
    return { ok: true, aligned, reprojectionMm: worst, markersFound };
  } finally {
    src.delete();
    gray.delete();
  }
}

/** Boxes checked across the card when verifying alignment */
const VERIFY_SAMPLE = 40;
/**
 * Limits for trusting an alignment. Flat cards find nearly every edge with a
 * median offset of 0 mm. A card bulging 9 mm in the middle finds about 60%,
 * with a median of 0.5 mm and a 90th percentile of 1.3 mm
 */
const VERIFY_MIN_FOUND = 0.75;
const VERIFY_MAX_MEDIAN_MM = 0.3;
const VERIFY_MAX_P90_MM = 0.8;

/**
 * Check that an aligned card's printed boxes sit where its layout puts them.
 *
 * The marker fit only proves the corners line up. A page that bulges or
 * folds in the middle still passes it, so the edges of boxes spread across
 * the whole card are checked too. Handwriting covers some edges, so only a
 * share of them need to be found.
 *
 * Returns
 * -------
 * Whether the alignment can be trusted.
 */
export function verifyAlignment(aligned: RGBA, layout: CardLayout): boolean {
  const boxes = layout.fields.flatMap((f) => (f.kind === "number" ? f.boxes : []));
  const step = Math.max(1, Math.floor(boxes.length / VERIFY_SAMPLE));
  const offsets: number[] = [];
  let checked = 0;
  for (let i = 0; i < boxes.length; i += step) {
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      checked++;
      const off = findGuideEdge(aligned, boxes[i], edge, PX_PER_MM, 1.5, 0.4);
      if (off !== null) offsets.push(Math.abs(off));
    }
  }
  if (offsets.length < checked * VERIFY_MIN_FOUND) return false;
  offsets.sort((a, b) => a - b);
  const median = offsets[Math.floor(offsets.length / 2)];
  const p90 = offsets[Math.floor(offsets.length * 0.9)];
  return median <= VERIFY_MAX_MEDIAN_MM && p90 <= VERIFY_MAX_P90_MM;
}
