import { expect, test } from "@playwright/test";
import { addFiles, CARDS, openApp, waitForCards } from "./helpers";

test("reading cards sends no images or values over the network", async ({ page }) => {
  await openApp(page);
  const requests: { method: string; url: string; body: number }[] = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer()?.length ?? 0 }));

  await addFiles(page, [`${CARDS}/scan-pen.jpg`, `${CARDS}/phone-angled-1.jpg`]);
  await waitForCards(page, 2);

  const origin = new URL(page.url()).origin;
  const offending = requests.filter((r) => r.method !== "GET" || r.body > 0 || !(r.url.startsWith(origin) || r.url.startsWith("blob:") || r.url.startsWith("data:")));
  expect(offending).toEqual([]);
});
