import { describe, expect, it } from "vitest";
import { buildCardV1 } from "../../src/cards/v1";
import { validateDefinition, type CardDefinition, type NumberField } from "../../src/cards/schema";

/** Sections and categories exactly as printed on the 2022 Cleanup Data Card */
const CARD_2022: Record<string, string[]> = {
  "Common items (tobacco, food, drink products)": [
    "Cigarette butts", "Tobacco (lighters, vapes, cigar tips, packs)", "Bags (plastic grocery)",
    "Bags (plastic other)", "Bags (paper)", "Bottles (plastic)", "Bottles (glass)", "Bottle cap (plastic)",
    "Bottle cap (metal)", "Cans / pull tabs (metal)", "Cups (foam)", "Cups (plastic)", "Cups (paper)",
    "Food waste", "Food wrappers", "Lids", "Plates (foam)", "Plates (plastic)", "Plates (paper)",
    "Straws/stirs/straw wrappers (plastic)", "Take out container (foam)", "Take out container (plastic)",
    "Take out container (paper)", "Utensils",
  ],
  "Local concern": [
    "Dog waste in bag", "Dog waste not in bag (piles)", "Wildlife waste with trash in it (piles)",
    "Sleds (large pieces)", "Fireworks & celebration items (consumer)", "Fireworks (commercial)",
  ],
  "Personal hygiene": [
    "COVID items (mask, wipes, gloves)", "Sanitary items (diapers, tampon)", "Toilet paper",
    "Human waste (don’t pick up)", "Protection (band aid, condom)", "Syringes (don’t pick up)",
  ],
  "Pieces smaller than a quarter": ["Foam pieces", "Glass pieces", "Plastic pieces"],
  "Pieces larger than a quarter": ["Foam pieces", "Glass pieces", "Plastic pieces"],
};

const straightQuotes = (s: string) => s.replace(/[’‘]/g, "'");

describe("card v1 definition", () => {
  const def = buildCardV1();

  it("is valid", () => {
    expect(validateDefinition(def)).toEqual([]);
  });

  it("keeps every 2022 category exactly once, under its 2022 section", () => {
    for (const [title, labels] of Object.entries(CARD_2022)) {
      const section = def.sections.find((s) => s.title === title);
      expect(section, title).toBeDefined();
      const printed = def.fields
        .filter((f): f is NumberField => f.kind === "number" && f.role === "item" && f.section === section!.id)
        .map((f) => f.label);
      expect(printed).toEqual(labels.map(straightQuotes));
    }
    const allItems = def.fields.filter((f) => f.kind === "number" && f.role === "item");
    expect(allItems).toHaveLength(Object.values(CARD_2022).flat().length);
  });

  it("gives every item row a tally area and at least three digit boxes", () => {
    for (const f of def.fields) {
      if (f.kind === "number" && f.role === "item") {
        expect(f.tallyRect, f.id).toBeDefined();
        expect(f.boxes.length, f.id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("has Other rows with a name area, tally area, and digit boxes", () => {
    const names = def.fields.filter((f) => f.role === "other-name");
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const n of names) {
      const count = def.fields.find((f) => f.role === "other-count" && f.otherRow === n.otherRow);
      expect(count?.kind).toBe("number");
    }
  });

  it("prints a decimal point inside the duration and square miles fields", () => {
    for (const id of ["header.duration", "header.sq-miles"]) {
      const f = def.fields.find((x) => x.id === id) as NumberField;
      expect(f.format).toBe("decimal");
      expect(f.decimalAfter).toBeDefined();
    }
  });
});

describe("card definition validator", () => {
  const clone = (): CardDefinition => structuredClone(buildCardV1());

  it("rejects an item row with too few digit boxes", () => {
    const def = clone();
    const lids = def.fields.find((f) => f.id === "item.lids") as NumberField;
    lids.boxes = lids.boxes.slice(0, 2);
    expect(validateDefinition(def)).toContain("item.lids has 2 digit boxes, needs at least 3");
  });

  it("rejects a moved version code", () => {
    const def = clone();
    def.versionCodeRect = { ...def.versionCodeRect, x: def.versionCodeRect.x + 5 };
    expect(validateDefinition(def)).toContain("versionCodeRect must match the shared card frame");
  });

  it("rejects duplicate field ids and unknown sections", () => {
    const def = clone();
    def.fields[3] = { ...def.fields[3], id: def.fields[2].id, section: "nope" } as typeof def.fields[3];
    const problems = validateDefinition(def);
    expect(problems).toContain(`duplicate field id "${def.fields[2].id}"`);
    expect(problems).toContain(`${def.fields[2].id} names unknown section "nope"`);
  });

  it("rejects fields that overlap each other or a marker's quiet zone", () => {
    const def = clone();
    const a = def.fields.find((f) => f.id === "item.lids") as NumberField;
    const b = def.fields.find((f) => f.id === "item.utensils") as NumberField;
    b.boxes[0] = { ...a.boxes[0] };
    a.tallyRect = { x: 8, y: 8, w: 10, h: 5 };
    const problems = validateDefinition(def);
    expect(problems).toContain("item.lids box 0 overlaps item.utensils box 0");
    expect(problems).toContain("item.lids tally overlaps the marker tl");
  });

  it("rejects a decimal field with no decimal position and a date without six boxes", () => {
    const def = clone();
    const d = def.fields.find((f) => f.id === "header.duration") as NumberField;
    delete d.decimalAfter;
    const date = def.fields.find((f) => f.id === "header.date") as NumberField;
    date.boxes = date.boxes.slice(0, 4);
    const problems = validateDefinition(def);
    expect(problems).toContain("header.duration is decimal and needs decimalAfter inside its boxes");
    expect(problems).toContain("header.date is a date and needs 6 boxes");
  });

  it("rejects an Other row missing its count", () => {
    const def = clone();
    def.fields = def.fields.filter((f) => f.id !== "other.2.count");
    expect(validateDefinition(def)).toContain("Other row 2 needs both a name area and a count");
  });
});
