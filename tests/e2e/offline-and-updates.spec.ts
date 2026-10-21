import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test("app loads offline after a first visit", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Reload once so the page is controlled by the service worker
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  await context.setOffline(false);
});

test("a newly deployed build offers a reload", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Staff returning to the app are on a page the service worker controls
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller && "__checkForUpdate" in window);
  const before = await page.locator(".version").textContent();

  // Publish a new build into the directory the preview server is serving
  execSync("npx vite build", { env: { ...process.env, BUILD_STAMP: `e2e-${Date.now()}` }, stdio: "ignore" });

  await page.evaluate(() => (window as unknown as { __checkForUpdate: () => Promise<void> }).__checkForUpdate());
  const banner = page.getByRole("status").filter({ hasText: "new version" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Reload now" }).click();
  await expect(page.locator(".version")).not.toHaveText(before!);
});
