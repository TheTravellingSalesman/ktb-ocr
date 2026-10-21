import { readFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/** An RGBA raster, laid out like the browser's `ImageData` */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Rasterize page 1 of a PDF at `pxPerMm` pixels per millimetre */
export async function renderPdfPage(path: string, pxPerMm: number): Promise<Raster> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  // PDF user space is 72 points per inch
  const viewport = page.getViewport({ scale: (pxPerMm * 25.4) / 72 });
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvas: canvas as any, canvasContext: ctx as any, viewport }).promise;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  await doc.cleanup?.();
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}
