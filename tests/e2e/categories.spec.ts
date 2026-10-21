import { expect, test, type Page } from "@playwright/test";
import { addFiles, CARDS, mod, openApp, openCard, waitForCards } from "./helpers";

const STORE = "https://script.example.test/macros/s/fake/exec";

/**
 * A fake Apps Script category store, served by intercepting requests.
 *
 * It holds one non-printed category, "Wagons / carts", and records writes.
 */
async function fakeStore(page: Page) {
  const categories: Record<string, unknown>[] = [{ id: "wagons", name: "Wagons / carts", printed: false, status: "active", merged_into: "" }];
  const aliases: Record<string, unknown>[] = [{ text: "wagon", category_id: "wagons" }];
  const writes: Record<string, unknown>[] = [];
  await page.route(`${STORE}**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { ok: true, categories, aliases }, headers: { "Access-Control-Allow-Origin": "*" } });
    const body = JSON.parse(req.postData() ?? "{}");
    if (body.action === "ensurePrinted") {
      for (const c of body.categories) if (!categories.some((x) => x.id === c.id)) categories.push({ ...c, printed: true, status: "active" });
    } else writes.push(body);
    return route.fulfill({ json: { ok: true }, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  return { writes };
}

/**
 * A stub embedder with fixed similarities to "Wagons / carts".
 *
 * Its vector is [1, 0, 0]. "close item" scores 0.95, "middling item" 0.6,
 * and everything else scores 0, so each match outcome can be forced.
 */
async function stubEmbedder(page: Page) {
  await page.addInitScript(() => {
    const vec = (t: string) =>
      t === "wagon" || t === "wagon cart"
        ? [1, 0, 0]
        : t === "close item"
          ? [0.95, Math.sqrt(1 - 0.95 ** 2), 0]
          : t === "middling item"
            ? [0.6, 0.8, 0]
            : [0, 0, 1];
    const DIM = 64;
    (globalThis as unknown as { __ktbTestEmbed: unknown }).__ktbTestEmbed = async (texts: string[]) =>
      texts.map((t) => {
        const v = vec(t);
        const out = new Float32Array(DIM);
        if (v[2] !== 1) {
          out[0] = v[0];
          out[1] = v[1];
          return out;
        }
        // Unrelated texts get seeded random directions away from the first two
        // axes. In 62 dimensions they're nearly orthogonal to each other
        let seed = [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
        let norm = 0;
        for (let i = 2; i < DIM; i++) norm += (out[i] = rand()) ** 2;
        for (let i = 2; i < DIM; i++) out[i] /= Math.sqrt(norm);
        return out;
      });
  });
}

async function nameOther(page: Page, row: number, text: string) {
  await page.locator(`[data-field-id="other.${row}.name"]`).fill(text);
  await expect(page.getByTestId(`category-${row}`)).toContainText(`“${text}”`);
}

test("Other items are pre-selected, offered, or proposed as new by how close they are", async ({ page }) => {
  const { writes } = await fakeStore(page);
  await stubEmbedder(page);
  await openApp(page, { storeUrl: STORE });
  await addFiles(page, [`${CARDS}/scan-pen.jpg`]);
  await waitForCards(page, 1);
  await openCard(page, "scan-pen.jpg");

  // Close enough to pre-select
  await nameOther(page, 1, "close item");
  await expect(page.getByTestId("category-1").locator("[data-mode]")).toHaveAttribute("data-mode", "auto");
  await expect(page.getByTestId("choice-1")).toHaveText("Wagons / carts");

  // Close enough to offer, with no pre-selection. Pick with Alt+1
  await nameOther(page, 2, "middling item");
  await expect(page.getByTestId("category-2").locator("[data-mode]")).toHaveAttribute("data-mode", "choose");
  await expect(page.getByTestId("choice-2")).toHaveCount(0);
  await expect(page.getByTestId("category-2").locator(".options button").first()).toContainText("Wagons / carts");
  await page.locator('[data-field-id="other.2.category"]').focus();
  await page.keyboard.press("Alt+1");
  await expect(page.getByTestId("choice-2")).toHaveText("Wagons / carts");
  // Accepting moves on to the next item needing attention
  await expect(page.locator(".item.focused")).not.toHaveAttribute("data-item-id", "other.2.category");

  // Nothing close: a new category
  await nameOther(page, 1, "kayak paddle");
  await expect(page.getByTestId("category-1").locator("[data-mode]")).toHaveAttribute("data-mode", "new");
  await expect(page.getByTestId("choice-1")).toHaveText("kayak paddle");

  // An exact alias needs no decision
  await nameOther(page, 2, "Wagons");
  await expect(page.getByTestId("category-2").locator("[data-mode]")).toHaveAttribute("data-mode", "exact");

  // Any category can be picked by searching
  await page.locator('[data-field-id="other.1.category"]').fill("bottles (pl");
  await page.locator('[data-field-id="other.1.category"]').press("Enter");
  await expect(page.getByTestId("choice-1")).toHaveText("Bottles (plastic)");
  await expect(page.getByTestId("category-1").locator(".choice .badge")).toHaveText("printed");

  // A second new item, then confirm. Decisions are recorded in the store
  await nameOther(page, 2, "sun hat");
  await expect(page.getByTestId("category-2").locator("[data-mode]")).toHaveAttribute("data-mode", "new");
  for (let i = 0; i < 100 && (await page.getByTestId("attention-count").textContent()) !== "Ready to confirm"; i++) {
    const id = (await page.locator(".item.focused").getAttribute("data-item-id"))!;
    if ((id === "header.name" || id === "header.location") && !(await page.locator(`[data-field-id="${id}"]`).inputValue())) await page.keyboard.type("X");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }
  await page.keyboard.press(`${mod}+Enter`);
  await expect.poll(() => writes.length).toBe(2);
  // Staff's explicit pick becomes an alias, so the next "kayak paddle" matches exactly
  expect(writes).toContainEqual({ action: "addAlias", text: "kayak paddle", categoryId: "bottles-plastic" });
  expect(writes).toContainEqual(expect.objectContaining({ action: "createCategory", name: "sun hat", firstAlias: "sun hat" }));
});
