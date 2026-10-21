/**
 * The shared category list for Other items.
 *
 * Categories are what items get counted under. Aliases are the raw strings
 * volunteers have written, each mapped to one category. Staff can rename,
 * merge, retire, and re-map them directly in the store, and the app follows
 * those edits the next time it loads the list.
 */
import { normalizeText } from "../core/normalize";

export type CategoryStatus = "active" | "retired" | "merged";

/**
 * One category.
 *
 * Attributes
 * ----------
 * id : str
 *     Stable identifier. Printed categories use the card's category ID, such
 *     as "bottles-plastic". Others use a UUID.
 * name : str
 *     Display name, editable by staff.
 * printed : bool
 *     Whether it's a printed card category.
 * status : CategoryStatus
 * mergedInto : str | None
 *     The category this one was merged into, when status is "merged".
 */
export interface Category {
  id: string;
  name: string;
  printed: boolean;
  status: CategoryStatus;
  mergedInto?: string;
}

/**
 * One raw string a volunteer wrote, mapped to a category.
 *
 * Attributes
 * ----------
 * text : str
 *     The normalized text.
 * categoryId : str
 * addedAt : str
 *     ISO time the alias was recorded.
 */
export interface Alias {
  text: string;
  categoryId: string;
  addedAt: string;
}

/**
 * A loaded category list with merges resolved.
 *
 * Methods
 * -------
 * resolve
 *     The active category an ID ends up at after following merges, or
 *     undefined if it's unknown or ends at a retired category.
 * active
 *     Every active category.
 * aliasesOf
 *     The normalized texts that map to a category, including aliases of
 *     categories merged into it.
 * lookupAlias
 *     The active category a text is an exact alias of, after normalization.
 */
export class CategoryList {
  private byId: Map<string, Category>;
  private aliasMap: Map<string, string>;

  constructor(
    readonly categories: Category[],
    readonly aliases: Alias[],
  ) {
    this.byId = new Map(categories.map((c) => [c.id, c]));
    this.aliasMap = new Map(aliases.map((a) => [normalizeText(a.text), a.categoryId]));
  }

  resolve(id: string): Category | undefined {
    const seen = new Set<string>();
    let c = this.byId.get(id);
    // Follow merges, guarding against a cycle someone typed into the sheet
    while (c && c.status === "merged" && c.mergedInto && !seen.has(c.id)) {
      seen.add(c.id);
      c = this.byId.get(c.mergedInto);
    }
    return c && c.status === "active" ? c : undefined;
  }

  active(): Category[] {
    return this.categories.filter((c) => c.status === "active");
  }

  aliasesOf(id: string): string[] {
    const out: string[] = [];
    for (const [text, target] of this.aliasMap) if (this.resolve(target)?.id === id) out.push(text);
    return out;
  }

  lookupAlias(text: string): Category | undefined {
    const target = this.aliasMap.get(normalizeText(text));
    return target ? this.resolve(target) : undefined;
  }
}
