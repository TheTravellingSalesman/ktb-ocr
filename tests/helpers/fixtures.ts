import { readFileSync } from "node:fs";
import sharp from "sharp";
import type { RGBA } from "../../src/core/raster";
import type { FixtureTruth } from "../../tools/make-fixtures";

const DIR = "tests/fixtures/cards";

/** Every fixture's ground truth */
export const MANIFEST: FixtureTruth[] = JSON.parse(readFileSync(`${DIR}/manifest.json`, "utf8"));

/** Decode a fixture image to RGBA */
export async function loadFixture(name: string): Promise<RGBA> {
  const { data, info } = await sharp(`${DIR}/${name}.jpg`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}
