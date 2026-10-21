import { describe, expect, it } from "vitest";
import { SheetStore } from "../../src/categories/sheetStore";
import { CategoryService } from "../../src/app/categories";
import { CategoryList } from "../../src/categories/model";
import { NullStore, type CategoryStore } from "../../src/categories/store";
import type { CardRecord } from "../../src/model/types";

/** A fake Apps Script endpoint backed by in-memory rows */
function fakeSheet() {
  const categories: Record<string, unknown>[] = [{ id: "wagons", name: "Wagons / carts", printed: "FALSE", status: "active", merged_into: "" }];
  const aliases: Record<string, unknown>[] = [{ text: "wagon", category_id: "wagons", added_at: "2026-01-01" }];
  const posts: Record<string, unknown>[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (!init || init.method !== "POST") {
      expect(url).toContain("action=load");
      return new Response(JSON.stringify({ ok: true, categories, aliases }));
    }
    expect((init.headers as Record<string, string>)["Content-Type"]).toMatch(/^text\/plain/);
    const body = JSON.parse(String(init.body));
    posts.push(body);
    if (body.action === "addAlias") aliases.push({ text: body.text, category_id: body.categoryId });
    return new Response(JSON.stringify({ ok: true }));
  }) as typeof fetch;
  return { categories, aliases, posts, fetchFn };
}

describe("sheet store", () => {
  it("loads categories and aliases from the sheet's columns", async () => {
    const sheet = fakeSheet();
    const { categories, aliases } = await new SheetStore("https://script.example/exec", sheet.fetchFn).load();
    expect(categories).toEqual([{ id: "wagons", name: "Wagons / carts", printed: false, status: "active" }]);
    expect(aliases).toEqual([{ text: "wagon", categoryId: "wagons", addedAt: "2026-01-01" }]);
  });

  it("posts writes as plain text so no CORS preflight is needed", async () => {
    const sheet = fakeSheet();
    const store = new SheetStore("https://script.example/exec", sheet.fetchFn);
    await store.addAlias("cart", "wagons");
    await store.createCategory({ id: "u1", name: "Kayak paddles", firstAlias: "kayak paddle" });
    expect(sheet.posts).toEqual([
      { action: "addAlias", text: "cart", categoryId: "wagons" },
      { action: "createCategory", id: "u1", name: "Kayak paddles", firstAlias: "kayak paddle" },
    ]);
  });

  it("raises when the script reports an error", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ ok: false, error: "locked" }))) as typeof fetch;
    await expect(new SheetStore("u", fetchFn).addAlias("x", "y")).rejects.toThrow("locked");
  });
});

describe("recording confirmed Other items", () => {
  const card = (choice: { categoryId: string; name: string; printed: boolean }): CardRecord => ({
    id: "c",
    order: 0,
    sourceName: "c.jpg",
    source: new Blob([]),
    addedAt: "",
    status: "review",
    fields: { "other.1.name": { value: "Cart", proposed: "Cart", blank: false, flags: [], needsAttention: true, accepted: true } },
    others: { 1: { row: 1, matchedText: "Cart", mode: "choose", options: [], choice, accepted: true } },
  });

  it("adds a confirmed match as an alias, so later cards match it exactly", async () => {
    const sheet = fakeSheet();
    const store = new SheetStore("u", sheet.fetchFn);
    const { categories, aliases } = await store.load();
    const service = new CategoryService(store, true, new CategoryList(categories, aliases), null, null);
    await service.record(card({ categoryId: "wagons", name: "Wagons / carts", printed: false }));
    expect(sheet.posts).toEqual([{ action: "addAlias", text: "cart", categoryId: "wagons" }]);
    expect((await service.match("carts")).mode).toBe("exact");
  });

  it("falls back to a provisional category when the store fails", async () => {
    const failing: CategoryStore = { ...new NullStore(), kind: "sheet", load: async () => ({ categories: [], aliases: [] }), addAlias: async () => {}, ensurePrinted: async () => {}, createCategory: async () => { throw new Error("offline"); } };
    const service = new CategoryService(failing, true, new CategoryList([], []), null, null);
    const { others, categoryNames } = await service.record(card({ categoryId: "new", name: "Cart", printed: false }));
    expect(others[1].choice).toEqual({ categoryId: "provisional:cart", name: "Cart", printed: false });
    expect(categoryNames).toEqual({ "provisional:cart": "Cart" });
  });
});
