import { describe, expect, it } from "vitest";
import layoutJson from "../../src/cards/generated/ktb-card-v1.layout.json";
import type { CardLayout } from "../../src/cards/schema";
import { CsvDownloadAdapter, selectForExport, toCsv } from "../../src/export/adapter";
import { cardRows, COLUMNS } from "../../src/export/rows";
import type { CardRecord, FieldState } from "../../src/model/types";

const layout = layoutJson as CardLayout;
const field = (value: string): FieldState => ({ value, proposed: value, blank: !value, flags: [], needsAttention: false, accepted: true });

function card(extra: Partial<CardRecord> = {}): CardRecord {
  return {
    id: "abc123-p0",
    order: 0,
    sourceName: "beach, day 1.jpg",
    source: new Blob([]),
    addedAt: "2026-10-21T00:00:00Z",
    status: "confirmed",
    version: "1",
    fields: {
      "header.name": field('Smith "Family"'),
      "header.date": field("06/14/26"),
      "header.location": field("Nevada Beach"),
      "header.volunteers": field("4"),
      "header.duration": field("2.5"),
      "item.bottles-plastic": field("12"),
      "item.lids": field(""),
      "other.1.name": field("water bottle"),
      "other.1.count": field("3"),
      "other.2.name": field("wagon"),
      "other.2.count": field("1"),
    },
    others: {
      1: { row: 1, matchedText: "water bottle", mode: "choose", options: [], choice: { categoryId: "bottles-plastic", name: "Bottles (plastic)", printed: true }, accepted: true },
      2: { row: 2, matchedText: "wagon", mode: "provisional", options: [], choice: { categoryId: "provisional:wagon", name: "wagon", printed: false }, accepted: true },
    },
    confirmedAt: "2026-10-21T01:00:00Z",
    ...extra,
  };
}

describe("export rows", () => {
  const rows = cardRows(card(), layout);

  it("has one row per non-blank count, each carrying the header fields", () => {
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.name_or_group).toBe('Smith "Family"');
      expect(r.date).toBe("2026-06-14");
      expect(r.duration_hours).toBe("2.5");
    }
  });

  it("keeps an Other item matched to a printed category separate from the printed row", () => {
    const printedRow = rows.find((r) => r.section === "common" && r.category_id === "bottles-plastic")!;
    const otherRow = rows.find((r) => r.section === "other" && r.category_id === "bottles-plastic")!;
    expect(printedRow.count).toBe("12");
    expect(printedRow.other_raw_text).toBe("");
    expect(otherRow).toMatchObject({ count: "3", other_raw_text: "water bottle", category_printed: "true", category_provisional: "false" });
  });

  it("marks provisional categories", () => {
    expect(rows.find((r) => r.other_raw_text === "wagon")).toMatchObject({ category_id: "provisional:wagon", category_provisional: "true" });
  });

  it("produces identical rows when the same card is exported twice", () => {
    expect(cardRows(card(), layout)).toEqual(rows);
  });
});

describe("CSV", () => {
  it("quotes commas, quotes, and line breaks", () => {
    const csv = toCsv(cardRows(card(), layout));
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe(COLUMNS.join(","));
    expect(lines[1]).toContain('"beach, day 1.jpg"');
    expect(lines[1]).toContain('"Smith ""Family"""');
    expect(lines).toHaveLength(5);
  });

  it("downloads through the adapter", async () => {
    let saved: { filename: string; csv: string } | null = null;
    await new CsvDownloadAdapter((filename, csv) => (saved = { filename, csv })).export([{ card: card(), layout }]);
    expect(saved!.filename).toMatch(/^ktb-cleanup-cards-.*\.csv$/);
    expect(saved!.csv.split("\r\n")).toHaveLength(5);
  });
});

describe("export selection", () => {
  it("includes only confirmed cards and reports the rest", () => {
    const cards = [card(), card({ id: "b", status: "review" }), card({ id: "c", status: "rejected" }), card({ id: "d", status: "review" })];
    const { included, leftOut } = selectForExport(cards);
    expect(included.map((c) => c.id)).toEqual(["abc123-p0"]);
    expect(leftOut).toEqual({ unconfirmed: 2, rejected: 1, processing: 0 });
  });
});
