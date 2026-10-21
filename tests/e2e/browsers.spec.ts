import { expect, test } from "@playwright/test";
import { addFiles, CARDS, openApp, openCard, waitForCards } from "./helpers";

test("a card is read and reviewable in this browser", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/phone-angled-1.jpg`, `${CARDS}/cropped-corner.jpg`]);
  await waitForCards(page, 2);
  await expect(page.locator(".card-row", { hasText: "cropped-corner.jpg" }).getByTestId("card-status")).toContainText("Card not fully in frame");
  await openCard(page, "phone-angled-1.jpg");
  await expect(page.locator('[data-field-id="header.volunteers"]')).not.toHaveValue("");
  await expect(page.locator("canvas.crop").first()).toBeVisible();
});
