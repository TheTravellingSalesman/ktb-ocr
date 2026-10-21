/**
 * Headless Chromium rendering for the card toolchain.
 *
 * Chromium turns the card SVG into the print PDF and into raster images,
 * with the fonts embedded so output doesn't depend on installed fonts.
 */
import { chromium, type Browser } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** CSS pixels per millimetre at Chromium's 96 dpi */
const CSS_PX_PER_MM = 96 / 25.4;

function fontFace(family: string, file: string, weight: number, style = "normal"): string {
  const data = readFileSync(require.resolve(file)).toString("base64");
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${weight};font-style:${style};}`;
}

/** `@font-face` rules for the card's label font and the example handwriting font */
export function cardFontCss(): string {
  const sans = (w: number, style = "normal") =>
    fontFace("Source Sans 3", `@fontsource/source-sans-3/files/source-sans-3-latin-${w}-${style}.woff2`, w, style);
  return [
    sans(400),
    sans(600),
    sans(700),
    sans(800),
    sans(400, "italic"),
    fontFace("Caveat", "@fontsource/caveat/files/caveat-latin-500-normal.woff2", 500),
  ].join("");
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  browser ??= await chromium.launch();
  return browser;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

function htmlFor(svg: string): string {
  return `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`;
}

/** Render an SVG page to a vector PDF of the given size in millimetres */
export async function svgToPdf(svg: string, page: { width: number; height: number }): Promise<Buffer> {
  const p = await (await getBrowser()).newPage();
  await p.setContent(htmlFor(svg), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  const pdf = await p.pdf({
    width: `${page.width}mm`,
    height: `${page.height}mm`,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    pageRanges: "1",
  });
  await p.close();
  return pdf;
}

/** Render an SVG page to PNG at `pxPerMm` pixels per millimetre */
export async function svgToPng(svg: string, page: { width: number; height: number }, pxPerMm: number): Promise<Buffer> {
  const width = Math.ceil(page.width * CSS_PX_PER_MM);
  const height = Math.ceil(page.height * CSS_PX_PER_MM);
  const context = await (await getBrowser()).newContext({
    viewport: { width, height },
    deviceScaleFactor: pxPerMm / CSS_PX_PER_MM,
  });
  const p = await context.newPage();
  await p.setContent(htmlFor(svg), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: page.width * CSS_PX_PER_MM, height: page.height * CSS_PX_PER_MM } });
  await context.close();
  return png;
}
