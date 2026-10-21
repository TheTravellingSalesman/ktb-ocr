import { expect, test } from "@playwright/test";
import { addFiles, CARDS, distinctImages, mod, openApp, openCard, waitForCards } from "./helpers";

test.setTimeout(900_000);

test("the handwriting model loads only for cards with text, reads it, and works offline once cached", async ({ page, context }) => {
  const modelRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("trocr")) modelRequests.push(r.url());
  });
  await openApp(page, { readText: true });
  // Make sure the service worker controls the page, as it does for returning staff
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  // A card with no writing never fetches the model
  await addFiles(page, [`${CARDS}/blank.jpg`]);
  await waitForCards(page, 1);
  expect(modelRequests).toEqual([]);

  // A card with writing does, and its text fields get proposals
  await addFiles(page, [`${CARDS}/scan-pen.jpg`]);
  await waitForCards(page, 2);
  expect(modelRequests.length).toBeGreaterThan(0);
  await openCard(page, "scan-pen.jpg");
  const name = page.locator('[data-field-id="header.name"]');
  await expect(name).not.toHaveValue("");
  console.log("read name as:", await name.inputValue(), "| location as:", await page.locator('[data-field-id="header.location"]').inputValue());

  // Text needs confirming even when read
  await expect(page.locator('.item.outstanding[data-item-id="header.name"]')).toBeVisible();
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByRole("alert")).toContainText("still need attention");
  await name.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('.item.outstanding[data-item-id="header.name"]')).toHaveCount(0);

  // Offline, after a reload, the cached model still reads new cards
  await page.getByRole("button", { name: "← Batch" }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".card-row")).toHaveCount(2);
  await addFiles(page, await distinctImages("phone-angled-1", 1));
  await waitForCards(page, 3);
  await openCard(page, "phone-angled-1-0.jpg");
  await expect(page.locator('[data-field-id="header.name"]')).not.toHaveValue("");
  await context.setOffline(false);
});
