/**
 * Generate synthetic filled-in card photos with ground truth.
 *
 * Usage: npm run fixtures
 *
 * Each fixture is a card rendered from the card definition, filled in with
 * held-out EMNIST digits, tally strokes, and handwritten-style text, then
 * photographed: warped, rotated, lit unevenly, colour cast, blurred, and
 * JPEG-compressed. The output is deterministic for a given seed.
 *
 * Writes tests/fixtures/cards/<name>.jpg and tests/fixtures/cards/manifest.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { buildCardV1 } from "../src/cards/v1";
import { renderCardSvg } from "../src/cards/render";
import type { CardDefinition, NumberField, Rect, TextField } from "../src/cards/schema";
import { loadCv } from "../src/pipeline/cv";
import { cardFontCss, closeBrowser, svgToPng } from "./render";

const OUT_DIR = "tests/fixtures/cards";
const CARD_PX_PER_MM = 8;

// ---------------------------------------------------------------------------
// Ground truth

/**
 * What was written in one number field.
 *
 * Attributes
 * ----------
 * written : str
 *     The digits written in the boxes, "" when none.
 * startBox : int
 *     Index of the box the first digit is in.
 * tally : int | None
 *     How many tally marks were drawn.
 * outside : bool
 *     Whether a number was written outside the boxes.
 * expectFlags : list[str]
 *     Flag codes the field should raise.
 * value : str
 *     The value a correct reading proposes.
 */
export interface NumberTruth {
  written: string;
  startBox: number;
  tally: number | null;
  outside: boolean;
  expectFlags: string[];
  value: string;
}

/**
 * One fixture's ground truth.
 *
 * Attributes
 * ----------
 * name : str
 * file : str
 * description : str
 * expect : {status: "read", versionCode: str} | {status: "rejected", code: str}
 * numbers : dict[str, NumberTruth]
 *     Every non-blank number field. Fields not listed are blank.
 * text : dict[str, str]
 *     Every non-blank text field and what was written.
 * ink : str
 */
export interface FixtureTruth {
  name: string;
  file: string;
  description: string;
  expect: { status: "read"; versionCode: string } | { status: "rejected"; code: string };
  numbers: Record<string, NumberTruth>;
  text: Record<string, string>;
  ink: string;
}

// ---------------------------------------------------------------------------
// Randomness

/** A small seeded PRNG, so fixtures are reproducible */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const uniform = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
const pick = <T>(rng: Rng, items: T[]): T => items[Math.floor(rng() * items.length)];
const chance = (rng: Rng, p: number) => rng() < p;

// ---------------------------------------------------------------------------
// Handwriting

const INKS = {
  pen: { color: "#16181d", width: 0.32, opacity: 1 },
  blue: { color: "#1f3a93", width: 0.32, opacity: 1 },
  pencil: { color: "#5a5a5a", width: 0.3, opacity: 0.85 },
};
type InkName = keyof typeof INKS;

interface Glyphs {
  cell: number;
  perRow: number;
  labels: number[];
  sheet: { data: Buffer; width: number };
}

function loadGlyphs(): Glyphs {
  const meta = JSON.parse(readFileSync("tests/fixtures/glyphs/digits.json", "utf8"));
  return { ...meta, sheet: { data: Buffer.alloc(0), width: 0 } };
}

async function loadGlyphSheet(g: Glyphs) {
  const { data, info } = await sharp("tests/fixtures/glyphs/digits.png").greyscale().raw().toBuffer({ resolveWithObject: true });
  g.sheet = { data, width: info.width };
}

const glyphCache = new Map<string, string>();

/** A data URL for one dataset glyph, drawn as ink colour with alpha from the glyph */
async function glyphImage(g: Glyphs, index: number, color: string, opacity: number): Promise<string> {
  const key = `${index}:${color}:${opacity}`;
  if (glyphCache.has(key)) return glyphCache.get(key)!;
  const { cell, perRow } = g;
  const r = Math.floor(index / perRow);
  const c = index % perRow;
  const rgba = Buffer.alloc(cell * cell * 4);
  const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const v = g.sheet.data[(r * cell + y) * g.sheet.width + c * cell + x];
      const o = (y * cell + x) * 4;
      rgba[o] = cr;
      rgba[o + 1] = cg;
      rgba[o + 2] = cb;
      rgba[o + 3] = Math.round(v * opacity);
    }
  }
  const png = await sharp(rgba, { raw: { width: cell, height: cell, channels: 4 } }).png().toBuffer();
  const url = `data:image/png;base64,${png.toString("base64")}`;
  glyphCache.set(key, url);
  return url;
}

/** Indexes of glyphs for each digit, so a digit can be drawn in many hands */
function glyphsByDigit(g: Glyphs): number[][] {
  const by: number[][] = Array.from({ length: 10 }, () => []);
  g.labels.forEach((label, i) => by[label].push(i));
  return by;
}

/** SVG for a handwritten digit centred near the middle of `r` */
async function digitSvg(g: Glyphs, by: number[][], rng: Rng, digit: number, r: Rect, ink: InkName): Promise<string> {
  const { color, opacity } = INKS[ink];
  const url = await glyphImage(g, pick(rng, by[digit]), color, opacity);
  // Dataset glyphs fill about 20 of their 28 pixels, so the image is drawn larger than the digit
  const size = r.h * uniform(rng, 1.05, 1.3);
  const cx = r.x + r.w / 2 + uniform(rng, -0.5, 0.5);
  const cy = r.y + r.h / 2 + uniform(rng, -0.4, 0.4);
  const rot = uniform(rng, -8, 8);
  return `<image href="${url}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" transform="rotate(${rot} ${cx} ${cy})"/>`;
}

/** SVG for hand-drawn tally strokes, wrapping onto more lines in tall areas */
function tallySvg(rng: Rng, r: Rect, count: number, ink: InkName): string {
  const { color, width, opacity } = INKS[ink];
  const lineH = Math.min(r.h - 0.6, 5.5);
  const lines = Math.max(1, Math.floor((r.h - 0.4) / (lineH + 0.4)));
  const perLine = Math.ceil(count / lines / 5) * 5;
  const pitch = Math.min(1.4, (r.w - 1) / (perLine * 1.12 + 1));
  const j = () => uniform(rng, -0.18, 0.18);
  const out: string[] = [];
  const stroke = `stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width * uniform(rng, 0.9, 1.2)}" stroke-linecap="round"`;
  let done = 0;
  for (let line = 0; line < lines && done < count; line++) {
    const top = r.y + 0.3 + line * (lineH + 0.4) + lineH * 0.08;
    const bottom = top + lineH * 0.84;
    let x = r.x + 0.6 + pitch * 0.5;
    for (let inLine = 0; inLine < perLine && done < count; ) {
      const group = Math.min(5, count - done);
      const start = x;
      for (let i = 0; i < Math.min(4, group); i++) {
        out.push(`<line x1="${x + j()}" y1="${top + j()}" x2="${x + j() + 0.15}" y2="${bottom + j()}" ${stroke}/>`);
        x += pitch;
      }
      if (group === 5) {
        out.push(`<line x1="${start - pitch * 0.55 + j()}" y1="${bottom - lineH * 0.12 + j()}" x2="${x - pitch * 0.45 + j()}" y2="${top + lineH * 0.15 + j()}" ${stroke}/>`);
      }
      done += group;
      inLine += group;
      x += pitch * 1.2;
    }
  }
  return out.join("");
}

/** SVG for a line of handwritten-style block letters in `r` */
function textSvg(rng: Rng, r: Rect, text: string, ink: InkName): string {
  const { color, opacity } = INKS[ink];
  const size = Math.min(r.h * 0.8, (r.w * 0.9) / (text.length * 0.42));
  const rot = uniform(rng, -1.5, 1.5);
  const x = r.x + uniform(rng, 0.8, 2.5);
  const y = r.y + r.h * 0.5 + size * 0.33;
  return `<text x="${x}" y="${y}" font-family="Caveat" font-weight="500" font-size="${size}" fill="${color}" fill-opacity="${opacity}" transform="rotate(${rot} ${x} ${y})">${text}</text>`;
}

// ---------------------------------------------------------------------------
// Filling in a card

type Special = "tally-no-total" | "disagree" | "gap" | "outside";

interface FillPlan {
  ink: InkName;
  /** Chance each item row is used */
  density: number;
  specials: Special[];
  header: boolean;
  others: string[];
}

const NAMES = ["TAHOE TRASH CREW", "SMITH FAMILY", "SOUTH SHORE ROTARY", "KTB VOLUNTEERS", "BIJOU SCOUTS"];
const PLACES = ["NEVADA BEACH", "KIVA BEACH", "COVE EAST", "ZEPHYR COVE", "POPE BEACH"];

/** Fill in a card, returning the SVG overlay and its ground truth */
async function fillCard(def: CardDefinition, g: Glyphs, by: number[][], rng: Rng, plan: FillPlan) {
  const parts: string[] = [];
  const numbers: Record<string, NumberTruth> = {};
  const text: Record<string, string> = {};
  const ink = plan.ink;

  const writeDigits = async (f: NumberField, digits: string, start: number) => {
    for (let i = 0; i < digits.length; i++) parts.push(await digitSvg(g, by, rng, Number(digits[i]), f.boxes[start + i], ink));
  };

  // Header facts
  if (plan.header) {
    const name = pick(rng, NAMES);
    const place = pick(rng, PLACES);
    for (const [id, value] of [["header.name", name], ["header.location", place]] as const) {
      const f = def.fields.find((x) => x.id === id) as TextField;
      parts.push(textSvg(rng, f.textRect, value, ink));
      text[id] = value;
    }
    const header = (id: string) => def.fields.find((x) => x.id === id) as NumberField;
    const month = String(Math.floor(uniform(rng, 5, 10))).padStart(2, "0");
    const day = String(Math.floor(uniform(rng, 1, 29))).padStart(2, "0");
    const date = `${month}${day}26`;
    await writeDigits(header("header.date"), date, 0);
    numbers["header.date"] = { written: date, startBox: 0, tally: null, outside: false, expectFlags: [], value: `${month}/${day}/26` };
    const vol = String(Math.floor(uniform(rng, 2, 40)));
    await writeDigits(header("header.volunteers"), vol, 0);
    numbers["header.volunteers"] = { written: vol, startBox: 0, tally: null, outside: false, expectFlags: [], value: vol };
    // Duration "2.5" is written as boxes [blank, 2, 5] around the printed point
    const hours = String(Math.floor(uniform(rng, 1, 4)));
    const tenths = String(Math.floor(uniform(rng, 0, 10)));
    const dur = header("header.duration");
    parts.push(await digitSvg(g, by, rng, Number(hours), dur.boxes[1], ink));
    parts.push(await digitSvg(g, by, rng, Number(tenths), dur.boxes[2], ink));
    numbers["header.duration"] = { written: hours + tenths, startBox: 1, tally: null, outside: false, expectFlags: [], value: `${hours}.${tenths}` };
    const lbs = String(Math.floor(uniform(rng, 5, 400)));
    await writeDigits(header("header.pounds"), lbs, 0);
    numbers["header.pounds"] = { written: lbs, startBox: 0, tally: null, outside: false, expectFlags: [], value: lbs };
  }

  // Item rows
  const items = def.fields.filter((f): f is NumberField => f.kind === "number" && f.role === "item");
  const specials = [...plan.specials];
  for (const f of items) {
    const special = specials.length && chance(rng, 0.25) ? specials.shift()! : null;
    if (!special && !chance(rng, plan.density)) continue;
    const big = f.boxes.length > 3;
    const count = Math.max(1, Math.round(big ? uniform(rng, 15, 60) : Math.pow(rng(), 2) * 30) || 1);
    const tallied = special === "disagree" || special === "tally-no-total" || chance(rng, 0.75);
    let written = String(count);
    let start = 0;
    let tallyCount: number | null = tallied ? count : null;
    let value = written;
    const expectFlags: string[] = [];

    if (special === "tally-no-total") {
      written = "";
      value = "";
      expectFlags.push("tally-no-total");
    } else if (special === "disagree") {
      // The volunteer swapped the digits of a two-digit count
      tallyCount = Math.max(12, count);
      written = String(tallyCount).split("").reverse().join("");
      if (Number(written) === tallyCount || Math.abs(Number(written) - tallyCount) <= Math.max(2, tallyCount * 0.2)) written = String(tallyCount + 15);
      value = written;
      expectFlags.push("tally-total-disagree");
    } else if (special === "gap") {
      tallyCount = null;
      written = String(Math.floor(uniform(rng, 1, 10))) + String(Math.floor(uniform(rng, 0, 10)));
      value = written;
      expectFlags.push("gap-between-boxes");
    } else if (special === "outside") {
      tallyCount = null;
      written = "";
      value = "";
      expectFlags.push("outside-boxes");
    } else if (chance(rng, 0.2) && written.length < f.boxes.length) {
      start = f.boxes.length - written.length;
    }

    if (tallyCount !== null) parts.push(tallySvg(rng, f.tallyRect!, tallyCount, ink));
    if (special === "gap") {
      parts.push(await digitSvg(g, by, rng, Number(written[0]), f.boxes[0], ink));
      parts.push(await digitSvg(g, by, rng, Number(written[1]), f.boxes[2], ink));
    } else if (special === "outside") {
      // A total squeezed in between the tally area and the boxes
      const b = f.boxes[0];
      const gap: Rect = { x: f.tallyRect!.x + f.tallyRect!.w - 2.2, y: b.y, w: 4.4, h: b.h };
      parts.push(await digitSvg(g, by, rng, Math.floor(uniform(rng, 2, 10)), gap, ink));
      parts.push(await digitSvg(g, by, rng, Math.floor(uniform(rng, 2, 10)), { ...gap, x: gap.x + 2.4 }, ink));
    } else if (written) {
      await writeDigits(f, written, start);
    }
    numbers[f.id] = { written, startBox: start, tally: tallyCount, outside: special === "outside", expectFlags, value };
  }
  if (specials.length) throw new Error(`fixture didn't place specials: ${specials.join(", ")}`);

  // Other rows
  for (const [i, item] of plan.others.entries()) {
    const row = i + 1;
    const name = def.fields.find((f) => f.id === `other.${row}.name`) as TextField;
    const count = def.fields.find((f) => f.id === `other.${row}.count`) as NumberField;
    parts.push(textSvg(rng, name.textRect, item, ink));
    text[name.id] = item;
    const n = String(Math.floor(uniform(rng, 1, 9)));
    parts.push(tallySvg(rng, count.tallyRect!, Number(n), ink));
    await writeDigits(count, n, 0);
    numbers[count.id] = { written: n, startBox: 0, tally: Number(n), outside: false, expectFlags: [], value: n };
  }

  return { overlay: parts.join("\n"), numbers, text };
}

// ---------------------------------------------------------------------------
// Photographing a card

/**
 * How a filled card is turned into a photo or scan.
 *
 * Attributes
 * ----------
 * canvas : [int, int]
 *     Output image size in pixels.
 * fill : float
 *     Fraction of the canvas the rotated card's bounding box takes.
 * rotate : float
 *     Rotation in degrees. 180 is upside down.
 * perspective : float
 *     Random corner displacement as a fraction of card size.
 * light : float
 *     Strength of the uneven lighting, 0 for none.
 * cast : [float, float, float]
 *     Per-channel colour multipliers.
 * blur : float
 *     Gaussian blur sigma in pixels.
 * noise : float
 *     Gaussian noise sigma in gray levels.
 * quality : int
 *     JPEG quality.
 * cropCorner : bool
 *     Push the card so one corner marker falls outside the image.
 * curl : float
 *     Amplitude in mm of a page curl that a single homography can't flatten.
 * clutter : bool
 *     Draw a busy background.
 */
interface Shot {
  canvas: [number, number];
  fill: number;
  rotate: number;
  perspective: number;
  light: number;
  cast: [number, number, number];
  blur: number;
  noise: number;
  quality: number;
  cropCorner?: boolean;
  curl?: number;
  clutter?: boolean;
}

/** Photograph a card raster according to `shot` */
async function photograph(cardPng: Buffer, shot: Shot, rng: Rng): Promise<Buffer> {
  const cv = await loadCv();
  const { data, info } = await sharp(cardPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let card = cv.matFromImageData({ data: new Uint8ClampedArray(data), width: info.width, height: info.height });

  // A bulge in the middle of the page. The corner markers barely move, so
  // only an interior alignment check can catch it
  if (shot.curl) {
    const mapX = new cv.Mat(card.rows, card.cols, cv.CV_32FC1);
    const mapY = new cv.Mat(card.rows, card.cols, cv.CV_32FC1);
    const amp = shot.curl * CARD_PX_PER_MM;
    for (let y = 0; y < card.rows; y++) {
      for (let x = 0; x < card.cols; x++) {
        const bulge = amp * Math.sin((Math.PI * x) / card.cols) * Math.sin((Math.PI * y) / card.rows);
        mapX.floatPtr(y, x)[0] = x + bulge * 0.4;
        mapY.floatPtr(y, x)[0] = y + bulge;
      }
    }
    const curled = new cv.Mat();
    cv.remap(card, curled, mapX, mapY, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    [card, mapX, mapY].forEach((m) => m.delete());
    card = curled;
  }

  // Background
  const [W, H] = shot.canvas;
  const bg = new cv.Mat(H, W, cv.CV_8UC4, new cv.Scalar(uniform(rng, 60, 160), uniform(rng, 60, 150), uniform(rng, 50, 140), 255));
  if (shot.clutter) {
    for (let i = 0; i < 30; i++) {
      const c = new cv.Scalar(uniform(rng, 0, 255), uniform(rng, 0, 255), uniform(rng, 0, 255), 255);
      const p1 = new cv.Point(uniform(rng, 0, W), uniform(rng, 0, H));
      const p2 = new cv.Point(p1.x + uniform(rng, -400, 400), p1.y + uniform(rng, -400, 400));
      if (chance(rng, 0.5)) cv.rectangle(bg, p1, p2, c, -1);
      else cv.line(bg, p1, p2, c, Math.round(uniform(rng, 2, 20)));
    }
  }

  // Where the card's corners land. The whole rotated card is fitted into the
  // canvas, unless the fixture deliberately crops a corner
  const cw = card.cols;
  const ch = card.rows;
  const theta = (shot.rotate * Math.PI) / 180;
  const jitter = [0, 1, 2, 3].map(() => [uniform(rng, -1, 1) * shot.perspective * cw, uniform(rng, -1, 1) * shot.perspective * ch]);
  const local = [
    [-cw / 2, -ch / 2],
    [cw / 2, -ch / 2],
    [cw / 2, ch / 2],
    [-cw / 2, ch / 2],
  ].map(([x, y], i) => {
    const [jx, jy] = jitter[i];
    return [(x + jx) * Math.cos(theta) - (y + jy) * Math.sin(theta), (x + jx) * Math.sin(theta) + (y + jy) * Math.cos(theta)];
  });
  const spanX = Math.max(...local.map((p) => p[0])) - Math.min(...local.map((p) => p[0]));
  const spanY = Math.max(...local.map((p) => p[1])) - Math.min(...local.map((p) => p[1]));
  const scale = Math.min((W * shot.fill) / spanX, (H * shot.fill) / spanY);
  const cx = W / 2 + (shot.cropCorner ? W * 0.2 : uniform(rng, -0.02, 0.02) * W);
  const cy = H / 2 + (shot.cropCorner ? H * 0.14 : uniform(rng, -0.02, 0.02) * H);
  const corners = local.map(([x, y]) => [cx + x * scale, cy + y * scale]);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, cw, 0, cw, ch, 0, ch]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  cv.warpPerspective(card, warped, M, new cv.Size(W, H), cv.INTER_AREA, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));

  // Composite over the background, then light, cast, blur, and noise
  const out = new Uint8ClampedArray(W * H * 4);
  const lx = uniform(rng, 0, W);
  const ly = uniform(rng, 0, H);
  const diag = Math.hypot(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = warped.data[i + 3] / 255;
      const light = 1 - shot.light * Math.min(1, Math.hypot(x - lx, y - ly) / diag) * 1.4;
      for (let c = 0; c < 3; c++) {
        const v = warped.data[i + c] * a + bg.data[i + c] * (1 - a);
        out[i + c] = v * light * shot.cast[c];
      }
      out[i + 3] = 255;
    }
  }
  let img = sharp(Buffer.from(out.buffer), { raw: { width: W, height: H, channels: 4 } }).removeAlpha();
  if (shot.blur > 0.3) img = img.blur(shot.blur);
  let raw = await img.raw().toBuffer();
  if (shot.noise > 0) {
    raw = Buffer.from(raw);
    for (let i = 0; i < raw.length; i++) {
      // Box-Muller
      const n = Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng());
      raw[i] = Math.max(0, Math.min(255, raw[i] + n * shot.noise));
    }
  }
  [card, bg, srcTri, dstTri, M, warped].forEach((m) => m.delete());
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: shot.quality }).toBuffer();
}

// ---------------------------------------------------------------------------
// The fixture set

interface FixtureSpec {
  name: string;
  description: string;
  seed: number;
  plan: FillPlan;
  shot: Shot;
  /** Cover or replace the version code before photographing */
  versionCode?: "missing" | "unknown";
  expectReject?: string;
}

const SCAN: Shot = { canvas: [1750, 2250], fill: 0.98, rotate: 0.3, perspective: 0, light: 0.05, cast: [1, 1, 1], blur: 0.4, noise: 3, quality: 88 };
const PHONE: Shot = { canvas: [1800, 2400], fill: 0.86, rotate: 0, perspective: 0.03, light: 0.3, cast: [1.02, 0.98, 0.92], blur: 0.6, noise: 4, quality: 82, clutter: true };
const full = (ink: InkName, extra: Partial<FillPlan> = {}): FillPlan => ({ ink, density: 0.45, specials: [], header: true, others: [], ...extra });

const FIXTURES: FixtureSpec[] = [
  { name: "scan-pen", description: "Flatbed scan, black pen, many rows filled", seed: 11, plan: full("pen", { density: 0.55, others: ["WAGON", "BALLOONS"] }), shot: SCAN },
  { name: "scan-blue-pen", description: "Flatbed scan, blue pen", seed: 12, plan: full("blue", { others: ["CART"] }), shot: { ...SCAN, rotate: -0.6 } },
  { name: "phone-angled-1", description: "Phone photo at an angle on a cluttered table", seed: 21, plan: full("pen"), shot: { ...PHONE, rotate: 12, perspective: 0.05 } },
  { name: "phone-angled-2", description: "Phone photo, strong perspective, warm light", seed: 22, plan: full("blue", { others: ["KAYAK PADDLE"] }), shot: { ...PHONE, rotate: -18, perspective: 0.07, cast: [1.05, 0.95, 0.82] } },
  { name: "phone-shadow", description: "Phone photo with a heavy shadow across the card", seed: 23, plan: full("pen"), shot: { ...PHONE, rotate: 4, light: 0.55, noise: 6 } },
  { name: "phone-pencil", description: "Phone photo of a card filled in pencil", seed: 24, plan: full("pencil", { others: ["FISHING LINE"] }), shot: { ...PHONE, rotate: -6 } },
  { name: "upside-down", description: "Card photographed upside down", seed: 31, plan: full("pen"), shot: { ...PHONE, rotate: 178, perspective: 0.03 } },
  { name: "sideways", description: "Card photographed sideways", seed: 32, plan: full("pen"), shot: { ...PHONE, canvas: [2400, 1800], rotate: 91, perspective: 0.02 } },
  {
    name: "special-cases",
    description: "Rows with tally but no total, a disagreeing total, a gap between digits, and writing outside the boxes",
    seed: 41,
    plan: full("pen", { density: 0.15, specials: ["tally-no-total", "disagree", "gap", "outside"] }),
    shot: { ...SCAN, rotate: 0.8 },
  },
  { name: "blank", description: "A blank card, photographed", seed: 51, plan: { ink: "pen", density: 0, specials: [], header: false, others: [] }, shot: { ...PHONE, rotate: 3 } },
  { name: "cropped-corner", description: "One corner marker cut off the edge of the photo", seed: 61, plan: full("pen"), shot: { ...PHONE, fill: 0.95, cropCorner: true }, expectReject: "not-in-frame" },
  { name: "missing-qr", description: "Version code covered up", seed: 62, plan: full("pen"), shot: SCAN, versionCode: "missing", expectReject: "unknown-version" },
  { name: "unknown-version", description: "Version code for a card version this app doesn't ship", seed: 63, plan: full("pen"), shot: SCAN, versionCode: "unknown", expectReject: "unknown-version" },
  { name: "curled", description: "A page bulging in the middle, which a single homography can't flatten", seed: 64, plan: full("pen"), shot: { ...SCAN, curl: 9 }, expectReject: "alignment-failed" },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const def = buildCardV1();
  const glyphs = loadGlyphs();
  await loadGlyphSheet(glyphs);
  const by = glyphsByDigit(glyphs);
  const fontCss = cardFontCss();
  const manifest: FixtureTruth[] = [];

  for (const spec of FIXTURES) {
    const rng = mulberry32(spec.seed);
    const filled = await fillCard(def, glyphs, by, rng, spec.plan);
    let renderDef = def;
    let overlay = filled.overlay;
    if (spec.versionCode === "unknown") renderDef = { ...def, versionCode: "KTBCARD:99" };
    if (spec.versionCode === "missing") {
      const r = def.versionCodeRect;
      overlay += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#fff"/>`;
    }
    const png = await svgToPng(renderCardSvg(renderDef, { fontCss, overlay }), def.page, CARD_PX_PER_MM);
    const jpg = await photograph(png, spec.shot, rng);
    const file = `${spec.name}.jpg`;
    writeFileSync(`${OUT_DIR}/${file}`, jpg);
    manifest.push({
      name: spec.name,
      file,
      description: spec.description,
      expect: spec.expectReject ? { status: "rejected", code: spec.expectReject } : { status: "read", versionCode: def.versionCode },
      numbers: filled.numbers,
      text: filled.text,
      ink: spec.plan.ink,
    });
    console.log(`${spec.name}: ${Object.keys(filled.numbers).length} number fields, ${Object.keys(filled.text).length} text fields`);
  }
  writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 1) + "\n");
  await closeBrowser();
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
