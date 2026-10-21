/**
 * Where the shared category list lives.
 *
 * The app only reaches the list through `CategoryStore`. Supporting another
 * backend means writing another implementation of it.
 */
import type { Alias, Category } from "./model";

/**
 * A backend for the shared category list.
 *
 * Methods
 * -------
 * load
 *     Every category and alias.
 * addAlias
 *     Record a normalized text as an alias of a category. Adding an alias
 *     that already exists does nothing.
 * createCategory
 *     Add a new category with its first alias. Creating a category whose ID
 *     already exists does nothing.
 * ensurePrinted
 *     Add any printed card categories the list doesn't have yet.
 */
export interface CategoryStore {
  readonly kind: string;
  load(): Promise<{ categories: Category[]; aliases: Alias[] }>;
  addAlias(text: string, categoryId: string): Promise<void>;
  createCategory(c: { id: string; name: string; firstAlias: string }): Promise<void>;
  ensurePrinted(cats: { id: string; name: string }[]): Promise<void>;
}

/** The ID given to a provisional category made from an item's text */
export const provisionalId = (normalized: string) => `provisional:${normalized}`;

/**
 * The store used when no shared store is configured or it can't be reached.
 *
 * It knows only the printed categories. Nothing is saved, so every new item
 * becomes a provisional category named from its text, marked so it can be
 * merged later.
 */
export class NullStore implements CategoryStore {
  readonly kind = "none";
  private printed: Category[] = [];

  async load() {
    return { categories: this.printed, aliases: [] };
  }

  async addAlias(): Promise<void> {}

  async createCategory(): Promise<void> {}

  async ensurePrinted(cats: { id: string; name: string }[]) {
    this.printed = cats.map((c) => ({ id: c.id, name: c.name, printed: true, status: "active" as const }));
  }
}
