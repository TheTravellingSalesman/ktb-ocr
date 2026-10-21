import { describe, expect, it } from "vitest";
import { CategoryList, type Category } from "../../src/categories/model";
import { loadEmbedder } from "../../src/categories/embedder";
import { matchItem, rankCategories } from "../../src/categories/matching";
import { buildCardV1 } from "../../src/cards/v1";

const printed: Category[] = buildCardV1()
  .fields.filter((f) => f.kind === "number" && f.role === "item")
  .map((f) => ({ id: (f as { categoryId: string }).categoryId, name: (f as { categoryName?: string }).categoryName ?? f.label, printed: true, status: "active" }));

const list = new CategoryList(
  [...printed, { id: "wagons", name: "Wagons / carts", printed: false, status: "active" }, { id: "balloons", name: "Balloons", printed: false, status: "active" }],
  [{ text: "wagon", categoryId: "wagons", addedAt: "" }],
);
const embed = loadEmbedder();
const top3 = async (text: string) => (await rankCategories(text, list, embed)).slice(0, 3).map((o) => o.name);

describe("matching Other items by intent", () => {
  it("offers a known category for a synonym of its alias", async () => {
    expect(await top3("cart")).toContain("Wagons / carts");
  });

  it("offers the right category for misread handwriting", async () => {
    expect(await top3("balon")).toContain("Balloons");
  });

  it("offers a printed category for an item it covers", async () => {
    const ranked = (await rankCategories("water bottle", list, embed)).slice(0, 3);
    const bottles = ranked.find((o) => o.name === "Bottles (plastic)");
    expect(bottles?.printed).toBe(true);
  });

  it("resolves an exact alias with no decision", async () => {
    const m = await matchItem("Wagon", list, embed, true);
    expect(m.mode).toBe("exact");
    expect(m.choice?.categoryId).toBe("wagons");
  });

  it("proposes a new category for a genuinely new item", async () => {
    const m = await matchItem("kayak paddle", list, embed, true);
    expect(m.mode).toBe("new");
    expect(m.choice?.name).toBe("kayak paddle");
  });

  it("makes a provisional category when the store is unavailable", async () => {
    const m = await matchItem("wagon wheel", list, embed, false);
    expect(m.mode).toBe("provisional");
    expect(m.choice).toEqual({ categoryId: "provisional:wagon wheel", name: "wagon wheel", printed: false });
  });

  it("acts on each threshold band", async () => {
    const fake = (score: number) => async (texts: string[]) => texts.map((_, i) => (i === 0 ? Float32Array.from([1, 0]) : Float32Array.from([score, Math.sqrt(1 - score * score)])));
    const small = new CategoryList([{ id: "x", name: "Thing", printed: false, status: "active" }], []);
    const t = { autoSelect: 0.8, offer: 0.5 };
    expect((await matchItem("other", small, fake(0.9), true, t)).mode).toBe("auto");
    expect((await matchItem("other", small, fake(0.6), true, t)).mode).toBe("choose");
    expect((await matchItem("other", small, fake(0.6), true, t)).choice).toBeUndefined();
    expect((await matchItem("other", small, fake(0.2), true, t)).mode).toBe("new");
  });
});
