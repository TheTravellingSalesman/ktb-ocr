import { expect, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

export const CARDS = "tests/fixtures/cards";
export const TMP = "test-results/e2e-files";

/** Open the app with the given settings, starting from an empty batch */
export async function openApp(page: Page, settings: Partial<{ storeUrl: string; readDigits: boolean; readText: boolean }> = {}) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem("e2e-started")) {
      sessionStorage.setItem("e2e-started", "1");
      localStorage.setItem("ktb-settings", JSON.stringify({ storeUrl: "", readDigits: true, readText: false, ...s }));
    }
  }, settings);
  await page.goto("/");
  await expect(page.getByText(/^Version /)).toBeVisible();
}

export async function addFiles(page: Page, paths: string[]) {
  await page.getByTestId("file-input").setInputFiles(paths);
}

/** Wait until the batch has `count` cards and none are still being read */
export async function waitForCards(page: Page, count: number) {
  await expect(page.locator(".card-row")).toHaveCount(count, { timeout: 120_000 });
  await expect(page.locator('.card-row[data-status="processing"]')).toHaveCount(0, { timeout: 180_000 });
}

/** Distinct copies of a fixture image, so each counts as a new card */
export async function distinctImages(name: string, count: number): Promise<string[]> {
  mkdirSync(TMP, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const path = `${TMP}/${name}-${i}.jpg`;
    writeFileSync(path, await sharp(`${CARDS}/${name}.jpg`).jpeg({ quality: 60 + i }).toBuffer());
    paths.push(path);
  }
  return paths;
}

/** A multi-page PDF with one fixture image per page */
export async function pdfOf(browser: Browser, images: string[], path: string): Promise<string> {
  mkdirSync(TMP, { recursive: true });
  const page = await browser.newPage();
  const imgs = images.map((p) => `<div class="p"><img src="data:image/jpeg;base64,${readFileSync(p).toString("base64")}"></div>`).join("");
  await page.setContent(`<style>@page{size:Letter;margin:0}body{margin:0}.p{width:8.5in;height:11in;page-break-after:always;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%}</style>${imgs}`);
  writeFileSync(path, await page.pdf({ format: "Letter", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } }));
  await page.close();
  return path;
}

/** Open a card's review screen from the batch */
export async function openCard(page: Page, sourceName: string) {
  await page.locator(".card-row", { hasText: sourceName }).getByRole("button").click();
  await expect(page.getByTestId("review-items")).toBeVisible();
}

export const mod = process.platform === "darwin" ? "Meta" : "Control";

/** Review every item with the keyboard, typing text where a field needs it, then confirm */
export async function reviewAndConfirm(page: Page, text: (id: string) => string = (id) => (id.endsWith(".name") ? "TYPED TEXT" : "")) {
  for (let i = 0; i < 100; i++) {
    if ((await page.getByTestId("attention-count").textContent()) === "Ready to confirm") break;
    const id = (await page.locator(".item.focused").getAttribute("data-item-id"))!;
    const input = page.locator(`[data-field-id="${id}"]`);
    if (!id.endsWith(".category") && !(await input.inputValue()) && text(id)) await page.keyboard.type(text(id));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }
  const left = await page.locator(".item.outstanding").evaluateAll((els) => els.map((e) => e.getAttribute("data-item-id")));
  expect(left, "items still needing attention").toEqual([]);
  await expect(page.getByTestId("attention-count")).toHaveText("Ready to confirm");
  await page.keyboard.press(`${mod}+Enter`);
}
