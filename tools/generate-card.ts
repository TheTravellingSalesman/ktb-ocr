/**
 * Generate the printable card and the app's field layout from one definition.
 *
 * Usage: npm run card
 *
 * Writes
 * - public/cards/ktb-card-v<version>.pdf, the print-ready card
 * - src/cards/generated/ktb-card-v<version>.layout.json, the layout the app loads
 * - tests/fixtures/blank-v<version>.png, a raster of the blank card for tests
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCardV1 } from "../src/cards/v1";
import { renderCardSvg } from "../src/cards/render";
import { toLayout, validateDefinition, type CardDefinition } from "../src/cards/schema";
import { cardFontCss, closeBrowser, svgToPdf, svgToPng } from "./render";

/** Resolution of the blank raster kept for tests */
const BLANK_PX_PER_MM = 8;

const DEFINITIONS: CardDefinition[] = [buildCardV1()];

async function main() {
  mkdirSync("public/cards", { recursive: true });
  mkdirSync("src/cards/generated", { recursive: true });
  mkdirSync("tests/fixtures", { recursive: true });

  for (const def of DEFINITIONS) {
    const problems = validateDefinition(def);
    if (problems.length) {
      throw new Error(`card v${def.version} is invalid:\n- ${problems.join("\n- ")}`);
    }
    const svg = renderCardSvg(def, { fontCss: cardFontCss() });
    const base = `ktb-card-v${def.version}`;
    writeFileSync(`public/cards/${base}.pdf`, await svgToPdf(svg, def.page));
    writeFileSync(`src/cards/generated/${base}.layout.json`, JSON.stringify(toLayout(def), null, 1) + "\n");
    writeFileSync(`tests/fixtures/blank-v${def.version}.png`, await svgToPng(svg, def.page, BLANK_PX_PER_MM));
    console.log(`card v${def.version}: wrote PDF, layout, and blank raster`);
  }
  await closeBrowser();
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
