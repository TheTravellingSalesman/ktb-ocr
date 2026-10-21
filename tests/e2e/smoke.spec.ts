import { expect, test } from "@playwright/test";

test("app loads and shows its version", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
});
