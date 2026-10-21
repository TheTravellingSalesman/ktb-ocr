import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { addFiles, CARDS, mod, openApp, openCard, waitForCards } from "./helpers";

const status = (page: Page, name: string) => page.locator(".card-row", { hasText: name }).getByTestId("card-status");

test("the batch shows each card's status", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/scan-pen.jpg`, `${CARDS}/cropped-corner.jpg`, `${CARDS}/blank.jpg`]);
  await waitForCards(page, 3);
  await expect(status(page, "scan-pen.jpg")).toHaveText(/\d+ need attention/);
  await expect(status(page, "cropped-corner.jpg")).toContainText("Card not fully in frame");
  await expect(status(page, "blank.jpg")).toHaveText("Ready to confirm");
});

test("every field shows its image, and the highlight follows focus", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/scan-blue-pen.jpg`]);
  await waitForCards(page, 1);
  await openCard(page, "scan-blue-pen.jpg");
  const items = page.locator("[data-item-id]");
  const count = await items.count();
  expect(count).toBeGreaterThan(50);
  await expect(page.locator("[data-item-id] canvas.crop")).toHaveCount(count);

  const highlight = page.getByTestId("highlight");
  const before = await highlight.getAttribute("style");
  await page.keyboard.press("ArrowDown");
  await expect(highlight).not.toHaveAttribute("style", before!);
  const focused = await page.locator(".item.focused").getAttribute("data-item-id");
  await expect(page.locator(`[data-field-id="${focused}"]`)).toBeFocused();
});

test("a card can be reviewed and confirmed with only the keyboard", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/scan-blue-pen.jpg`]);
  await waitForCards(page, 1);
  await page.locator(".card-row").getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("review-items")).toBeVisible();
  // Text fields aren't read automatically in this test, so type them
  await expect(page.locator(".item.focused")).toBeVisible();
  for (let i = 0; i < 80; i++) {
    if ((await page.getByTestId("attention-count").textContent()) === "Ready to confirm") break;
    const id = await page.locator(".item.focused").getAttribute("data-item-id");
    if (id === "header.name" || id === "header.location" || id?.endsWith(".name")) await page.keyboard.type("TYPED TEXT");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
  }
  await expect(page.getByTestId("attention-count")).toHaveText("Ready to confirm");
  await page.keyboard.press(`${mod}+Enter`);
  await expect(status(page, "scan-blue-pen.jpg")).toHaveText("Confirmed");
});

test("confirming is blocked while a flagged field is unaccepted", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/special-cases.jpg`]);
  await waitForCards(page, 1);
  await openCard(page, "special-cases.jpg");
  const firstOutstanding = await page.locator(".item.outstanding").first().getAttribute("data-item-id");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByRole("alert")).toContainText("still need attention");
  await expect(page.locator(".item.focused")).toHaveAttribute("data-item-id", firstOutstanding!);
  await page.getByRole("button", { name: "← Batch" }).click();
  await expect(status(page, "special-cases.jpg")).toHaveText(/need attention/);
});

test("flagged fields show their reason, and Shift+Enter takes the suggestion", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/special-cases.jpg`]);
  await waitForCards(page, 1);
  await openCard(page, "special-cases.jpg");
  const item = page.locator(".item", { has: page.locator('[data-flag="tally-no-total"]') }).first();
  await expect(item.locator('[data-flag="tally-no-total"]')).toContainText("Tally marks");
  const suggestion = (await item.locator(".suggestion").textContent())!.match(/Use (\d+)/)![1];
  await item.locator("input").focus();
  await page.keyboard.press("Shift+Enter");
  await expect(item.locator("input")).toHaveValue(suggestion);
  await expect(item.locator(".tick")).toBeVisible();
});

test("a rejected card can be entered by hand and confirmed", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/cropped-corner.jpg`]);
  await waitForCards(page, 1);
  await page.getByRole("button", { name: "Enter by hand" }).click();
  await expect(page.getByRole("alert")).toContainText("Card not fully in frame");
  await expect(page.getByTestId("full-card").locator("img")).toHaveAttribute("alt", "The card image as added");
  await expect(page.locator('[data-field-id="item.lids"]')).toHaveValue("");
  await page.locator('[data-field-id="item.lids"]').fill("7");
  await page.locator('[data-field-id="header.name"]').fill("Smith family");
  await page.getByRole("button", { name: /Confirm card/ }).click();
  await expect(status(page, "cropped-corner.jpg")).toHaveText("Confirmed");
});

test("review work survives a reload and an app update", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/scan-pen.jpg`]);
  await waitForCards(page, 1);
  await openCard(page, "scan-pen.jpg");
  await page.locator('[data-field-id="header.name"]').fill("RELOAD TEST");
  await page.locator('[data-field-id="item.lids"]').fill("99");

  await page.reload();
  await expect(page.locator('[data-field-id="header.name"]')).toHaveValue("RELOAD TEST");
  await expect(page.locator('[data-field-id="item.lids"]')).toHaveValue("99");

  // Ship a new build, then take the update
  await page.waitForFunction(() => !!navigator.serviceWorker.controller && "__checkForUpdate" in window);
  execSync("npx vite build", { env: { ...process.env, BUILD_STAMP: `update-${Date.now()}` }, stdio: "ignore" });
  await page.evaluate(() => (window as unknown as { __checkForUpdate: () => Promise<void> }).__checkForUpdate());
  await page.getByRole("button", { name: "Reload now" }).click();
  await expect(page.locator(".version")).toContainText("update-");
  await expect(page.locator('[data-field-id="header.name"]')).toHaveValue("RELOAD TEST");
  await expect(page.locator('[data-field-id="item.lids"]')).toHaveValue("99");
});

test("staff are warned when the browser won't keep the batch", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "storage", { value: { persisted: async () => false, persist: async () => false, estimate: async () => ({}) } });
  });
  await openApp(page);
  await expect(page.getByTestId("storage-warning")).toBeVisible();
});

test("no warning when the browser keeps the batch", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "storage", { value: { persisted: async () => true, persist: async () => true, estimate: async () => ({}) } });
  });
  await openApp(page);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("storage-warning")).toHaveCount(0);
});


test("a rejected card's image can be replaced with a retake, keeping its place", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/blank.jpg`, `${CARDS}/cropped-corner.jpg`, `${CARDS}/scan-blue-pen.jpg`]);
  await waitForCards(page, 3);
  await page.getByRole("button", { name: "Enter by hand" }).click();
  await page.locator('input[type="file"]').setInputFiles(`${CARDS}/scan-pen.jpg`);
  await waitForCards(page, 3);
  await expect(page.locator(".card-row .name")).toHaveText(["blank.jpg", "scan-pen.jpg", "scan-blue-pen.jpg"]);
  await expect(status(page, "scan-pen.jpg")).toHaveText(/need attention/);
});
