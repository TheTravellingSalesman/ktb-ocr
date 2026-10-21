/**
 * Output adapters: where confirmed cards go.
 *
 * The app only exports through `OutputAdapter`. Sending data somewhere new,
 * such as whatever database KTB uses next, means writing a new adapter.
 */
import type { CardLayout } from "../cards/schema";
import type { CardRecord } from "../model/types";
import { cardRows, COLUMNS, type Row } from "./rows";

/**
 * A destination for confirmed cards.
 *
 * Methods
 * -------
 * export
 *     Send the confirmed cards to the destination.
 */
export interface OutputAdapter {
  readonly name: string;
  export(cards: { card: CardRecord; layout: CardLayout }[]): Promise<void>;
}

/** One CSV field, quoted when it holds a comma, quote, or line break */
function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV text for the rows, with a header line. The byte order mark helps Excel read UTF-8 */
export function toCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvField(r[c])).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * Exports confirmed cards as a downloaded CSV file.
 *
 * Attributes
 * ----------
 * download : (filename: str, csv: str) -> None
 *     Saves the file. Exposed for the sake of injection for testing.
 */
export class CsvDownloadAdapter implements OutputAdapter {
  readonly name = "CSV download";

  constructor(private download: (filename: string, csv: string) => void = browserDownload) {}

  async export(cards: { card: CardRecord; layout: CardLayout }[]): Promise<void> {
    const rows = cards.flatMap(({ card, layout }) => cardRows(card, layout));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    this.download(`ktb-cleanup-cards-${stamp}.csv`, toCsv(rows));
  }
}

function browserDownload(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Which cards an export will include, and which it leaves out and why.
 *
 * Returns
 * -------
 * The confirmed cards, and a count of the others by reason.
 */
export function selectForExport(cards: CardRecord[]): { included: CardRecord[]; leftOut: { unconfirmed: number; rejected: number; processing: number } } {
  const leftOut = { unconfirmed: 0, rejected: 0, processing: 0 };
  const included: CardRecord[] = [];
  for (const c of cards) {
    if (c.status === "confirmed") included.push(c);
    else if (c.status === "rejected") leftOut.rejected++;
    else if (c.status === "processing") leftOut.processing++;
    else leftOut.unconfirmed++;
  }
  return { included, leftOut };
}
