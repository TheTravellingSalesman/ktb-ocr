/**
 * The app's connection to the shared category list.
 *
 * Connects to the configured store, falling back to provisional categories
 * when there's none or it can't be reached. Matches Other items, and records
 * staff decisions back to the store when a card is confirmed.
 */
import { LAYOUTS } from "../pipeline/version";
import { CategoryList } from "../categories/model";
import { matchItem, type MatchResult } from "../categories/matching";
import { NullStore, provisionalId, type CategoryStore } from "../categories/store";
import { SheetStore } from "../categories/sheetStore";
import type { Embedder } from "../categories/embedder";
import { normalizeText } from "../core/normalize";
import type { CardRecord, OtherState } from "../model/types";

/** Every printed category across the card versions this app reads */
export function printedCategories(): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const layout of Object.values(LAYOUTS)) {
    for (const f of layout.fields) {
      if (f.kind === "number" && f.role === "item" && f.categoryId) seen.set(f.categoryId, f.categoryName ?? f.label);
    }
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

/** An embedder that runs in a worker */
function workerEmbedder(): Embedder {
  let worker: Worker | null = null;
  let next = 0;
  const pending = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>();
  return (texts) => {
    if (!worker) {
      worker = new Worker(new URL("../categories/embed.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        pending.delete(e.data.id);
        if (e.data.error) p?.reject(new Error(e.data.error));
        else p?.resolve(e.data.vectors);
      };
    }
    const id = next++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker!.postMessage({ id, texts });
    });
  };
}

/**
 * The connected category list.
 *
 * Attributes
 * ----------
 * store : CategoryStore
 * available : bool
 *     Whether the shared store is configured and reachable. When false, Other
 *     items become provisional categories.
 * list : CategoryList
 * problem : str | None
 *     Why the shared store isn't available, in words staff can act on.
 * embed : Embedder | None
 *     Exposed for the sake of injection for testing.
 */
export class CategoryService {
  constructor(
    public store: CategoryStore,
    public available: boolean,
    public list: CategoryList,
    public problem: string | null,
    private embed: Embedder | null,
  ) {}

  /** Connect to the configured store, or fall back to provisional categories */
  static async connect(storeUrl: string, embed: Embedder | null = workerEmbedder()): Promise<CategoryService> {
    const printed = printedCategories();
    if (storeUrl.trim()) {
      const store = new SheetStore(storeUrl.trim());
      try {
        await store.ensurePrinted(printed);
        const { categories, aliases } = await store.load();
        return new CategoryService(store, true, new CategoryList(categories, aliases), null, embed);
      } catch (e) {
        const problem = `The category sheet couldn't be reached (${e instanceof Error ? e.message : e}). Other items will become provisional categories.`;
        return CategoryService.fallback(printed, problem, embed);
      }
    }
    return CategoryService.fallback(printed, null, embed);
  }

  private static async fallback(printed: { id: string; name: string }[], problem: string | null, embed: Embedder | null) {
    const store = new NullStore();
    await store.ensurePrinted(printed);
    const { categories, aliases } = await store.load();
    return new CategoryService(store, false, new CategoryList(categories, aliases), problem, embed);
  }

  /** Match an Other item's text against the list */
  match(text: string): Promise<MatchResult> {
    return matchItem(text, this.list, this.embed, this.available);
  }

  /** Every active category, for staff picking any category by hand */
  allCategories() {
    return this.list.active().map((c) => ({ categoryId: c.id, name: c.name, printed: c.printed }));
  }

  /**
   * Record a confirmed card's Other decisions in the store.
   *
   * New categories are created with fresh IDs, and confirmed matches become
   * aliases. If the store fails, the affected items fall back to provisional
   * categories, so confirming never fails because of the sheet.
   *
   * Returns
   * -------
   * The card's final Other states, and the name of every category it uses as
   * of now, so re-exports are identical.
   */
  async record(card: CardRecord): Promise<{ others: Record<number, OtherState>; categoryNames: Record<string, string> }> {
    const others: Record<number, OtherState> = structuredClone(card.others);
    const names: Record<string, string> = {};
    for (const state of Object.values(others)) {
      const text = card.fields[`other.${state.row}.name`]?.value.trim() ?? "";
      const normalized = normalizeText(text || state.choice?.name || "");
      let choice = state.choice!;
      try {
        if (!this.available) throw new Error("no store");
        if (choice.categoryId === "new" || choice.categoryId.startsWith("provisional:")) {
          const id = crypto.randomUUID();
          await this.store.createCategory({ id, name: choice.name, firstAlias: normalized });
          choice = { ...choice, categoryId: id };
          this.list = new CategoryList(
            [...this.list.categories, { id, name: choice.name, printed: false, status: "active" }],
            [...this.list.aliases, { text: normalized, categoryId: id, addedAt: new Date().toISOString() }],
          );
        } else if (normalized && this.list.lookupAlias(normalized)?.id !== choice.categoryId) {
          await this.store.addAlias(normalized, choice.categoryId);
          this.list = new CategoryList(this.list.categories, [
            ...this.list.aliases,
            { text: normalized, categoryId: choice.categoryId, addedAt: new Date().toISOString() },
          ]);
        }
      } catch {
        if (choice.categoryId === "new" || !this.available) {
          choice = { categoryId: provisionalId(normalized), name: choice.name, printed: false };
        }
      }
      state.choice = choice;
      names[choice.categoryId] = choice.name;
    }
    return { others, categoryNames: names };
  }
}
