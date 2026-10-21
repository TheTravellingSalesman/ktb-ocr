import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/** Load Code.gs into a sandbox with in-memory stand-ins for the Apps Script services */
function loadScript() {
  const sheets = new Map<string, unknown[][]>();
  let locked = false;
  const sheetApi = (rows: unknown[][]) => ({
    appendRow: (r: unknown[]) => rows.push(r),
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
  });
  const sandbox: Record<string, unknown> = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n: string) => (sheets.has(n) ? sheetApi(sheets.get(n)!) : null),
        insertSheet: (n: string) => {
          sheets.set(n, []);
          return sheetApi(sheets.get(n)!);
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          if (locked) throw new Error("lock already held");
          locked = true;
        },
        releaseLock: () => (locked = false),
      }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s: string) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }),
    },
  };
  runInNewContext(readFileSync("apps-script/Code.gs", "utf8"), sandbox);
  const call = (name: string, arg: unknown) => (sandbox[name] as (a: unknown) => { body: Record<string, unknown> })(arg).body;
  return {
    sheets,
    get: () => call("doGet", { parameter: { action: "load" } }),
    post: (body: object) => call("doPost", { postData: { contents: JSON.stringify(body) } }),
  };
}

describe("category store Apps Script", () => {
  it("creates its tabs and serves an empty list", () => {
    const s = loadScript();
    expect(s.get()).toEqual({ ok: true, categories: [], aliases: [] });
    expect(s.sheets.get("Categories")![0]).toEqual(["id", "name", "printed", "status", "merged_into"]);
  });

  it("writes duplicate aliases and categories only once", () => {
    const s = loadScript();
    s.post({ action: "createCategory", id: "u1", name: "Wagons / carts", firstAlias: "wagon" });
    s.post({ action: "createCategory", id: "u1", name: "Wagons / carts", firstAlias: "wagon" });
    s.post({ action: "addAlias", text: "cart", categoryId: "u1" });
    s.post({ action: "addAlias", text: "cart", categoryId: "u1" });
    const list = s.get() as { categories: unknown[]; aliases: { text: string }[] };
    expect(list.categories).toHaveLength(1);
    expect(list.aliases.map((a) => a.text)).toEqual(["wagon", "cart"]);
  });

  it("seeds printed categories without duplicating them", () => {
    const s = loadScript();
    const printed = [{ id: "lids", name: "Lids" }, { id: "utensils", name: "Utensils" }];
    s.post({ action: "ensurePrinted", categories: printed });
    s.post({ action: "ensurePrinted", categories: printed });
    const list = s.get() as { categories: { id: string; printed: boolean }[] };
    expect(list.categories.map((c) => [c.id, c.printed])).toEqual([["lids", true], ["utensils", true]]);
  });

  it("releases its lock after every write, so writes queue rather than fail", () => {
    const s = loadScript();
    for (let i = 0; i < 5; i++) expect(s.post({ action: "addAlias", text: `t${i}`, categoryId: "x" }).ok).toBe(true);
  });

  it("rejects unknown actions", () => {
    expect(loadScript().post({ action: "dropTable" })).toEqual({ ok: false, error: "unknown action dropTable" });
  });
});
