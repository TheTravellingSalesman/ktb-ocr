import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { addFiles, CARDS, openApp, openCard, reviewAndConfirm, waitForCards } from "./helpers";

/** Parse the app's CSV, which only quotes fields holding commas, quotes, or line breaks */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n") row.push(field.replace(/\r$/, "")), rows.push(row), (row = []), (field = "");
    else field += ch;
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

test("a batch can be added, reviewed by hand, and exported to CSV with provisional Other rows", async ({ page }) => {
  await openApp(page);
  await addFiles(page, [`${CARDS}/scan-pen.jpg`, `${CARDS}/blank.jpg`]);
  await waitForCards(page, 2);

  await openCard(page, "scan-pen.jpg");
  await reviewAndConfirm(page, (id) => ({ "header.name": "SOUTH SHORE ROTARY", "header.location": "COVE EAST", "other.1.name": "WAGON", "other.2.name": "BALLOONS" })[id] ?? "");
  // Confirming moves on to the next card that needs review
  await expect(page.getByRole("heading", { name: "blank.jpg" })).toBeVisible();
  await page.getByRole("button", { name: "← Batch" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await (await download).path();
  await expect(page.getByTestId("export-note")).toHaveText("Exported 1 confirmed card. Left out: 1 not yet confirmed.");

  const csv = readFileSync(file!, "utf8").replace(/^﻿/, "");
  const rows = parseCsv(csv);
  expect(rows.length).toBeGreaterThan(10);
  expect(new Set(rows.map((r) => r.source_file))).toEqual(new Set(["scan-pen.jpg"]));
  expect(rows.every((r) => r.name_or_group === "SOUTH SHORE ROTARY" && r.location === "COVE EAST")).toBe(true);
  const others = rows.filter((r) => r.section === "other");
  expect(others.map((r) => [r.other_raw_text, r.category_id, r.category_provisional])).toEqual([
    ["WAGON", "provisional:wagon", "true"],
    ["BALLOONS", "provisional:balloon", "true"],
  ]);
});
