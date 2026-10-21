/**
 * The category store backed by a Google Sheet.
 *
 * A small Apps Script attached to the sheet serves the list and records
 * changes (see apps-script/Code.gs). Staff triage the list by editing the
 * sheet directly.
 */
import type { Alias, Category, CategoryStatus } from "./model";
import type { CategoryStore } from "./store";

/** How long to wait for the sheet before falling back to provisional categories, in ms */
const TIMEOUT_MS = 15_000;

interface SheetCategory {
  id: string;
  name: string;
  printed: boolean | string;
  status: string;
  merged_into?: string;
}

interface SheetAlias {
  text: string;
  category_id: string;
  added_at?: string;
}

const asBool = (v: boolean | string) => v === true || String(v).toLowerCase() === "true";
const asStatus = (v: string): CategoryStatus => (v === "retired" || v === "merged" ? v : "active");

/**
 * A `CategoryStore` that reads and writes a Google Sheet through its Apps Script web app.
 *
 * Attributes
 * ----------
 * url : str
 *     The script's deployment URL. It acts as a shared secret.
 * fetchFn : typeof fetch
 *     Exposed for the sake of injection for testing.
 */
export class SheetStore implements CategoryStore {
  readonly kind = "sheet";

  constructor(
    private url: string,
    private fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  async load(): Promise<{ categories: Category[]; aliases: Alias[] }> {
    const res = await this.fetchFn(`${this.url}?action=load`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await this.parse(res);
    const categories = (body.categories as SheetCategory[]).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      printed: asBool(c.printed),
      status: asStatus(String(c.status ?? "active").trim().toLowerCase()),
      ...(c.merged_into ? { mergedInto: String(c.merged_into) } : {}),
    }));
    const aliases = (body.aliases as SheetAlias[]).map((a) => ({
      text: String(a.text),
      categoryId: String(a.category_id),
      addedAt: String(a.added_at ?? ""),
    }));
    return { categories, aliases };
  }

  addAlias(text: string, categoryId: string): Promise<void> {
    return this.post({ action: "addAlias", text, categoryId });
  }

  createCategory(c: { id: string; name: string; firstAlias: string }): Promise<void> {
    return this.post({ action: "createCategory", ...c });
  }

  ensurePrinted(cats: { id: string; name: string }[]): Promise<void> {
    return this.post({ action: "ensurePrinted", categories: cats });
  }

  // A text/plain body keeps the browser from sending a CORS preflight, which Apps Script can't answer
  private async post(body: object): Promise<void> {
    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await this.parse(res);
  }

  private async parse(res: Response): Promise<Record<string, unknown>> {
    if (!res.ok) throw new Error(`category store responded ${res.status}`);
    const body = await res.json();
    if (!body || body.ok !== true) throw new Error(`category store error: ${body?.error ?? "unknown"}`);
    return body;
  }
}
