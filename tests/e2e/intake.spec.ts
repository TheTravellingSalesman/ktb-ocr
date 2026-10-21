import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { addFiles, CARDS, distinctImages, openApp, pdfOf, TMP } from "./helpers";

test("twenty dropped photos make twenty cards", async ({ page }) => {
  await openApp(page, { readDigits: false });
  await addFiles(page, await distinctImages("phone-angled-1", 20));
  await expect(page.locator(".card-row")).toHaveCount(20, { timeout: 120_000 });
});

test("a twelve-page PDF makes twelve cards, one per page", async ({ page, browser }) => {
  await openApp(page, { readDigits: false });
  const pdf = await pdfOf(browser, Array.from({ length: 12 }, () => `${CARDS}/scan-pen.jpg`), `${TMP}/twelve.pdf`);
  await addFiles(page, [pdf]);
  await expect(page.locator(".card-row")).toHaveCount(12, { timeout: 120_000 });
  await expect(page.locator(".card-row", { hasText: "twelve.pdf (page 12)" })).toBeVisible();
});

test("an unsupported file is rejected by name and the others are still added", async ({ page }) => {
  await openApp(page, { readDigits: false });
  writeFileSync(`${TMP}/notes.txt`, "not a card");
  await addFiles(page, [`${TMP}/notes.txt`, `${CARDS}/blank.jpg`]);
  await expect(page.getByTestId("intake-problems")).toContainText("notes.txt: Not a supported image or PDF.");
  await expect(page.locator(".card-row")).toHaveCount(1);
});

test("adding the same file twice is caught", async ({ page }) => {
  await openApp(page, { readDigits: false });
  await addFiles(page, [`${CARDS}/blank.jpg`]);
  await expect(page.locator(".card-row")).toHaveCount(1);
  await addFiles(page, [`${CARDS}/blank.jpg`]);
  await expect(page.getByTestId("intake-problems")).toContainText("Already in the batch.");
  await expect(page.locator(".card-row")).toHaveCount(1);
});
