import { describe, expect, it } from "vitest";
import { CategoryList, type Category } from "../../src/categories/model";
import { NullStore } from "../../src/categories/store";
import { normalizeText } from "../../src/core/normalize";

const cat = (id: string, extra: Partial<Category> = {}): Category => ({ id, name: id, printed: false, status: "active", ...extra });

describe("text normalization", () => {
  it.each([
    ["  Water-Bottles!! ", "water bottle"],
    ["CART", "cart"],
    ["Carts", "cart"],
    ["Batteries", "battery"],
    ["boxes", "box"],
    ["Glass", "glass"],
    ["sunglasses", "sunglass"],
    ["Café   cups", "cafe cup"],
    ["bus", "bus"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});

describe("category list", () => {
  it("follows merged_into chains to the active category", () => {
    const list = new CategoryList([cat("a", { status: "merged", mergedInto: "b" }), cat("b", { status: "merged", mergedInto: "c" }), cat("c")], []);
    expect(list.resolve("a")?.id).toBe("c");
  });

  it("survives a merge cycle typed into the store", () => {
    const list = new CategoryList([cat("a", { status: "merged", mergedInto: "b" }), cat("b", { status: "merged", mergedInto: "a" })], []);
    expect(list.resolve("a")).toBeUndefined();
  });

  it("doesn't offer retired categories or match their aliases", () => {
    const list = new CategoryList([cat("old", { status: "retired" }), cat("new")], [{ text: "thing", categoryId: "old", addedAt: "" }]);
    expect(list.active().map((c) => c.id)).toEqual(["new"]);
    expect(list.lookupAlias("thing")).toBeUndefined();
  });

  it("matches aliases of a merged category to the category it was merged into", () => {
    const list = new CategoryList(
      [cat("carts", { status: "merged", mergedInto: "wagons" }), cat("wagons", { name: "Wagons / carts" })],
      [{ text: "cart", categoryId: "carts", addedAt: "" }, { text: "wagon", categoryId: "wagons", addedAt: "" }],
    );
    expect(list.lookupAlias("Carts")?.name).toBe("Wagons / carts");
    expect(list.aliasesOf("wagons").sort()).toEqual(["cart", "wagon"]);
  });
});

describe("null store", () => {
  it("seeds only the printed categories and saves nothing", async () => {
    const store = new NullStore();
    await store.ensurePrinted([{ id: "bottles-plastic", name: "Bottles (plastic)" }]);
    await store.addAlias();
    const { categories, aliases } = await store.load();
    expect(categories).toEqual([{ id: "bottles-plastic", name: "Bottles (plastic)", printed: true, status: "active" }]);
    expect(aliases).toEqual([]);
  });
});
