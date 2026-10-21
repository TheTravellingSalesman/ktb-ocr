import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCards, closeDb, deleteCard, getCard, getEmbedding, loadCards, putEmbedding, requestPersistence, saveCard } from "../../src/storage/db";
import type { CardRecord } from "../../src/model/types";

const card = (id: string, order: number): CardRecord => ({
  id,
  order,
  sourceName: `${id}.jpg`,
  source: new Blob(["img"], { type: "image/jpeg" }),
  addedAt: "2026-10-21T00:00:00Z",
  status: "review",
  fields: { "item.lids": { value: "3", proposed: "3", blank: false, flags: [], needsAttention: false, accepted: false } },
  others: {},
});

describe("batch storage", () => {
  afterEach(async () => {
    await clearCards();
    await closeDb();
  });

  it("round-trips a card record", async () => {
    await saveCard(card("a", 0));
    const back = await getCard("a");
    expect(back?.fields["item.lids"].value).toBe("3");
    expect(back?.sourceName).toBe("a.jpg");
  });

  it("lists cards in batch order and survives reopening", async () => {
    await saveCard(card("b", 2));
    await saveCard(card("a", 1));
    await closeDb();
    expect((await loadCards()).map((c) => c.id)).toEqual(["a", "b"]);
    await deleteCard("a");
    expect((await loadCards()).map((c) => c.id)).toEqual(["b"]);
  });

  it("caches embeddings", async () => {
    await putEmbedding("m:cart", Float32Array.from([1, 2, 3]));
    expect(Array.from((await getEmbedding("m:cart"))!)).toEqual([1, 2, 3]);
  });

  it("reports when persistence is denied", async () => {
    vi.stubGlobal("navigator", { storage: { persisted: async () => false, persist: async () => false } });
    expect(await requestPersistence()).toBe(false);
    vi.stubGlobal("navigator", { storage: { persisted: async () => false, persist: async () => true } });
    expect(await requestPersistence()).toBe(true);
    vi.unstubAllGlobals();
  });
});
