/**
 * Render a card definition to SVG.
 *
 * The SVG is the single drawing of the card. The generator turns it into the
 * print-ready PDF, and the fixture generator draws handwriting on top of it.
 * It's never shipped in the app.
 */
import QRCode from "qrcode";
import { markerGrid } from "./aruco";
import { COLORS } from "./style";
import { CARD_FRAME, type CardDefinition, type Decoration, type Field, type NumberField, type Rect } from "./schema";

/** Rough average glyph width of the label font, as a fraction of font size */
const GLYPH_WIDTH = 0.47;
const LABEL_SIZE = 2.8;
const LABEL_MIN_SIZE = 2.5;

/**
 * Options for `renderCardSvg`.
 *
 * Attributes
 * ----------
 * fontCss : str
 *     `@font-face` rules to embed, so renders don't depend on installed fonts.
 * overlay : str
 *     Extra SVG drawn on top of the card, in millimetre coordinates. The
 *     fixture generator uses it for handwriting.
 */
export interface RenderOptions {
  fontCss?: string;
  overlay?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (v: number) => +v.toFixed(3);

function rect(r: Rect, attrs: string): string {
  return `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" ${attrs}/>`;
}

function text(x: number, y: number, s: string, size: number, attrs = ""): string {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" ${attrs}>${esc(s)}</text>`;
}

/** A label fitted into `r`, shrinking first and wrapping onto two lines if needed */
function fittedLabel(r: Rect, label: string, weight = 400): string {
  const fill = `fill="${COLORS.ink}" font-weight="${weight}"`;
  const width = (s: string, size: number) => s.length * size * GLYPH_WIDTH;
  const size = Math.min(LABEL_SIZE, r.w / (label.length * GLYPH_WIDTH));
  if (size >= LABEL_MIN_SIZE) return text(r.x + 0.3, r.y + r.h / 2 + size * 0.35, label, n(size), fill);

  // Break at the space closest to the middle
  const spaces = [...label.matchAll(/ /g)].map((m) => m.index!);
  const mid = label.length / 2;
  const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), spaces[0] ?? label.length);
  const lines = [label.slice(0, at), label.slice(at + 1)];
  const twoLine = Math.min(LABEL_SIZE, ...lines.map((l) => (LABEL_SIZE * r.w) / width(l, LABEL_SIZE)));
  const lineGap = twoLine * 1.05;
  const top = r.y + r.h / 2 - lineGap / 2 + twoLine * 0.35;
  return lines.map((l, i) => text(r.x + 0.3, top + i * lineGap, l, n(twoLine), fill)).join("");
}

/** Hand-drawn style tally strokes, in groups of four crossed by a fifth */
export function tallyStrokes(r: Rect, count: number, color: string, jitter: () => number = () => 0): string {
  const out: string[] = [];
  const pitch = Math.min(1.3, r.w / (count * 1.15 + 1));
  const groupGap = pitch * 1.2;
  let x = r.x + pitch;
  const top = r.y + r.h * 0.12;
  const bottom = r.y + r.h * 0.88;
  const stroke = `stroke="${color}" stroke-width="0.32" stroke-linecap="round"`;
  for (let done = 0; done < count; ) {
    const inGroup = Math.min(5, count - done);
    const uprights = Math.min(4, inGroup);
    const start = x;
    for (let i = 0; i < uprights; i++) {
      out.push(`<line x1="${n(x + jitter())}" y1="${n(top + jitter())}" x2="${n(x + jitter())}" y2="${n(bottom + jitter())}" ${stroke}/>`);
      x += pitch;
    }
    if (inGroup === 5) {
      out.push(`<line x1="${n(start - pitch * 0.6 + jitter())}" y1="${n(bottom - r.h * 0.1 + jitter())}" x2="${n(x - pitch * 0.4 + jitter())}" y2="${n(top + r.h * 0.12 + jitter())}" ${stroke}/>`);
    }
    done += inGroup;
    x += groupGap;
  }
  return out.join("");
}

function marker(id: number, r: Rect): string {
  const grid = markerGrid(id);
  const cell = r.w / 6;
  const q = CARD_FRAME.quietZone;
  const cells = grid.flatMap((row, y) =>
    row.map((black, x) => (black ? rect({ x: r.x + x * cell, y: r.y + y * cell, w: cell, h: cell }, `fill="#000" shape-rendering="crispEdges"`) : "")),
  );
  return rect({ x: r.x - q, y: r.y - q, w: r.w + 2 * q, h: r.h + 2 * q }, `fill="#fff"`) + cells.join("");
}

function versionCode(payload: string, r: Rect): string {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const margin = 2;
  const cell = (r.w - 2 * margin) / size;
  const cells: string[] = [rect(r, `fill="#fff"`)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(y, x)) {
        cells.push(rect({ x: r.x + margin + x * cell, y: r.y + margin + y * cell, w: cell, h: cell }, `fill="#000" shape-rendering="crispEdges"`));
      }
    }
  }
  return cells.join("");
}

/** The printed guides and label for one field */
function field(f: Field): string {
  const guide = `fill="none" stroke="${COLORS.dropout}" stroke-width="0.35"`;
  const out: string[] = [];
  if (f.kind === "text") {
    if (f.labelRect) out.push(fittedLabel(f.labelRect, f.label, 600));
    out.push(rect(f.textRect, `${guide} rx="0.6"`));
    return out.join("");
  }
  if (f.role !== "other-count") out.push(fittedLabel(f.labelRect, f.label, f.role === "header" ? 600 : 400));
  if (f.tallyRect) out.push(rect(f.tallyRect, `fill="none" stroke="${COLORS.dropout}" stroke-width="0.25" rx="0.6"`));
  f.boxes.forEach((b) => out.push(rect(b, guide)));
  out.push(separators(f));
  return out.join("");
}

/** Decimal points and date slashes, printed in the dropout tint between boxes */
function separators(f: NumberField): string {
  const between = (i: number) => (f.boxes[i].x + f.boxes[i].w + f.boxes[i + 1].x) / 2;
  const b0 = f.boxes[0];
  if (f.format === "decimal" && f.decimalAfter !== undefined) {
    return `<circle cx="${n(between(f.decimalAfter))}" cy="${n(b0.y + b0.h - 0.9)}" r="0.55" fill="${COLORS.dropout}"/>`;
  }
  if (f.format === "date") {
    return [1, 3]
      .map((i) => text(between(i), b0.y + b0.h * 0.78, "/", 4, `fill="${COLORS.dropout}" text-anchor="middle"`))
      .join("");
  }
  return "";
}

function decoration(d: Decoration): string {
  switch (d.type) {
    case "text": {
      const attrs = [
        `fill="${d.color ?? COLORS.ink}"`,
        d.weight ? `font-weight="${d.weight}"` : "",
        d.anchor ? `text-anchor="${d.anchor}"` : "",
        d.italic ? `font-style="italic"` : "",
      ].join(" ");
      return text(d.x, d.y, d.text, d.size, attrs);
    }
    case "rect":
      return rect(
        d.rect,
        `fill="${d.fill ?? "none"}" ${d.stroke ? `stroke="${d.stroke}" stroke-width="${d.strokeWidth ?? 0.3}"` : ""} ${d.radius ? `rx="${d.radius}"` : ""}`,
      );
    case "line":
      return `<line x1="${n(d.x1)}" y1="${n(d.y1)}" x2="${n(d.x2)}" y2="${n(d.y2)}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}"/>`;
    case "tally":
      return tallyStrokes(d.rect, d.count, d.color);
    case "handDigit":
      return text(d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h * 0.82, d.digit, d.rect.h * 0.95, `fill="${d.color}" text-anchor="middle" font-family="Caveat"`);
  }
}

/** Render a card definition as a standalone SVG document */
export function renderCardSvg(def: CardDefinition, options: RenderOptions = {}): string {
  const { width, height } = def.page;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" font-family="'Source Sans 3', sans-serif">`,
    options.fontCss ? `<style>${options.fontCss}</style>` : "",
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>`,
    ...def.decorations.map(decoration),
    ...def.fields.map(field),
    ...def.markers.map((m) => marker(m.id, m.rect)),
    versionCode(def.versionCode, def.versionCodeRect),
    options.overlay ?? "",
    `</svg>`,
  ].join("\n");
}
