/**
 * Keep Tahoe Blue category store.
 *
 * A web app over this spreadsheet's two tabs. The card digitizer reads the
 * category list from it and records staff decisions to it. Staff triage the
 * list by editing the tabs directly: rename a category, set its status to
 * "retired", or set it to "merged" and fill in merged_into.
 *
 * Tabs
 * ----
 * Categories: id, name, printed, status, merged_into
 * Aliases: text, category_id, added_at
 *
 * Setup: run `setup` once from the editor, then Deploy > New deployment >
 * Web app, execute as yourself, access "Anyone". Paste the deployment URL
 * into the digitizer's settings. The URL acts as a shared secret.
 */

var CATEGORIES = "Categories";
var ALIASES = "Aliases";
var CATEGORY_HEADERS = ["id", "name", "printed", "status", "merged_into"];
var ALIAS_HEADERS = ["text", "category_id", "added_at"];

/** Create the two tabs with their headers, if they don't exist yet */
function setup() {
  sheet_(CATEGORIES, CATEGORY_HEADERS);
  sheet_(ALIASES, ALIAS_HEADERS);
}

/** Serve the whole category list */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "load";
  if (action !== "load") return json_({ ok: false, error: "unknown action " + action });
  return json_({ ok: true, categories: rows_(CATEGORIES, CATEGORY_HEADERS), aliases: rows_(ALIASES, ALIAS_HEADERS) });
}

/**
 * Record a change. Writes hold the script lock and are idempotent, so two
 * staff confirming the same item at once still produce one row.
 */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "request body isn't JSON" });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === "addAlias") addAlias_(body.text, body.categoryId);
    else if (body.action === "createCategory") createCategory_(body.id, body.name, body.firstAlias);
    else if (body.action === "ensurePrinted") ensurePrinted_(body.categories || []);
    else return json_({ ok: false, error: "unknown action " + body.action });
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function addAlias_(text, categoryId) {
  text = String(text || "").trim();
  if (!text || !categoryId) return;
  var existing = rows_(ALIASES, ALIAS_HEADERS);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].text).trim() === text) return;
  }
  sheet_(ALIASES, ALIAS_HEADERS).appendRow([text, categoryId, new Date().toISOString()]);
}

function createCategory_(id, name, firstAlias) {
  if (!id || !name) return;
  var existing = rows_(CATEGORIES, CATEGORY_HEADERS);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].id) === String(id)) return;
  }
  sheet_(CATEGORIES, CATEGORY_HEADERS).appendRow([id, name, false, "active", ""]);
  addAlias_(firstAlias, id);
}

function ensurePrinted_(categories) {
  var existing = rows_(CATEGORIES, CATEGORY_HEADERS);
  var ids = {};
  for (var i = 0; i < existing.length; i++) ids[String(existing[i].id)] = true;
  var sheet = sheet_(CATEGORIES, CATEGORY_HEADERS);
  for (var j = 0; j < categories.length; j++) {
    var c = categories[j];
    if (!ids[c.id]) {
      sheet.appendRow([c.id, c.name, true, "active", ""]);
      ids[c.id] = true;
    }
  }
}

/** The named tab, created with its header row if missing */
function sheet_(name, headers) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

/** Every data row of a tab as an object keyed by header */
function rows_(name, headers) {
  var values = sheet_(name, headers).getDataRange().getValues();
  var head = values[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    if (values[r].join("") === "") continue;
    var row = {};
    for (var c = 0; c < head.length; c++) row[head[c]] = values[r][c];
    out.push(row);
  }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
