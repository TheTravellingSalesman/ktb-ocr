import { describe, expect, it } from "vitest";
import layoutJson from "../../src/cards/generated/ktb-card-v1.layout.json";
import type { CardLayout } from "../../src/cards/schema";
import { canConfirm, categoryItemId, fieldStateFrom, manualFieldStates, outstanding, reviewOrder } from "../../src/app/review";
import type { CardRecord } from "../../src/model/types";
import type { FieldReading } from "../../src/pipeline/fields";

const layout = layoutJson as CardLayout;

function readCard(readings: Partial<Record<string, Partial<FieldReading>>>): CardRecord {
  const fields = Object.fromEntries(
    layout.fields.map((f) => {
      const r: FieldReading = { fieldId: f.id, kind: f.kind, value: "", blank: true, flags: [], needsConfirmation: false, ...readings[f.id] };
      return [f.id, fieldStateFrom(r)];
    }),
  );
  return { id: "c", order: 0, sourceName: "c.jpg", source: new Blob([]), addedAt: "", status: "review", fields, others: {} };
}

describe("review order and confirmation", () => {
  const card = readCard({
    "item.lids": { value: "21", blank: false, flags: [{ code: "tally-total-disagree", message: "x" }], suggestion: "12" },
    "header.name": { value: "SMITH", blank: false, needsConfirmation: true },
    "other.1.name": { value: "WAGON", blank: false, needsConfirmation: true },
    "other.1.count": { value: "2", blank: false },
    "item.cups-foam": { value: "3", blank: false },
  });

  it("puts flagged fields, text to confirm, and Other categories first", () => {
    const ids = reviewOrder(card, layout).map((i) => i.id);
    expect(ids.slice(0, 4)).toEqual(["header.name", "item.lids", "other.1.name", categoryItemId(1)]);
    expect(ids).toContain("item.cups-foam");
    expect(ids.length).toBe(layout.fields.length + 1);
  });

  it("can't confirm until every item needing attention is accepted", () => {
    expect(canConfirm(card, layout)).toBe(false);
    expect(outstanding(card, layout).map((i) => i.id)).toEqual(["header.name", "item.lids", "other.1.name", categoryItemId(1)]);

    card.fields["header.name"].accepted = true;
    card.fields["item.lids"].accepted = true;
    card.fields["other.1.name"].accepted = true;
    expect(canConfirm(card, layout)).toBe(false);

    card.others[1] = { row: 1, matchedText: "WAGON", mode: "provisional", options: [], choice: { categoryId: "provisional:wagon", name: "WAGON", printed: false }, accepted: true };
    expect(canConfirm(card, layout)).toBe(true);
  });

  it("keeps the review order stable as items are accepted", () => {
    expect(reviewOrder(card, layout).map((i) => i.id).slice(0, 4)).toEqual(["header.name", "item.lids", "other.1.name", categoryItemId(1)]);
  });

  it("gives a hand-entered card empty inputs for every field", () => {
    const fields = manualFieldStates(layout);
    expect(Object.keys(fields)).toHaveLength(layout.fields.length);
    expect(Object.values(fields).every((f) => f.value === "" && !f.needsAttention)).toBe(true);
  });
});
