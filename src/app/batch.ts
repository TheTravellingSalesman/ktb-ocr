/**
 * The batch: every card added in this browser, and everything done to them.
 *
 * Every change is saved to IndexedDB before the screen updates, so closing
 * the tab, reloading, or updating the app never loses work.
 */
import { useEffect, useState } from "preact/hooks";
import type { CardLayout } from "../cards/schema";
import type { CardRecord, FieldState, OtherState } from "../model/types";
import { LAYOUTS } from "../pipeline/version";
import { clearCards, deleteCard, loadCards, saveCard } from "../storage/db";
import type { CategoryService } from "./categories";
import { readFiles, type IntakeProblem } from "./intake";
import { processInWorker } from "./processor";
import { canConfirm, fieldStateFrom, manualFieldStates } from "./review";
import { loadSettings } from "./settings";

/** The newest card layout, used for cards entered by hand */
export const LATEST_LAYOUT: CardLayout = Object.values(LAYOUTS).sort((a, b) => Number(b.version) - Number(a.version))[0];

/** The layout a card is reviewed with */
export function layoutOf(card: CardRecord): CardLayout {
  return (card.versionCode && LAYOUTS[card.versionCode]) || LATEST_LAYOUT;
}

type Listener = () => void;

/**
 * The batch store.
 *
 * Properties
 * ----------
 * cards : list[CardRecord]
 *     Every card, in batch order.
 * ready : bool
 *     Whether saved cards have been loaded.
 *
 * Methods
 * -------
 * init
 *     Load saved cards, and restart any that were mid-processing at reload.
 * addFiles
 *     Add dropped or picked files, returning a problem for each file that
 *     couldn't be added.
 * setField, acceptField, setOther
 *     Record staff review actions.
 * confirm
 *     Confirm a card once nothing needs attention, recording its Other
 *     decisions in the category store.
 * replaceImage
 *     Swap a card's image for a retake, keeping its place in the batch.
 * clear
 *     Remove every card.
 */
class BatchStore {
  cards: CardRecord[] = [];
  ready = false;
  private listeners = new Set<Listener>();
  private queue: Promise<void> = Promise.resolve();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  get(id: string): CardRecord | undefined {
    return this.cards.find((c) => c.id === id);
  }

  async init(): Promise<void> {
    this.cards = await loadCards();
    this.ready = true;
    this.notify();
    for (const c of this.cards) if (c.status === "processing") this.enqueue(c);
  }

  private writes: Promise<void> = Promise.resolve();

  /**
   * Replace a card in memory immediately, then persist it.
   *
   * The in-memory update is synchronous, so changes made in quick succession
   * (a keystroke and a category match, say) always build on each other.
   * Writes to IndexedDB are serialized, so the last change is the one stored.
   */
  private save(card: CardRecord): Promise<void> {
    const i = this.cards.findIndex((c) => c.id === card.id);
    if (i >= 0) this.cards[i] = card;
    else this.cards = [...this.cards, card].sort((a, b) => a.order - b.order);
    this.cards = [...this.cards];
    this.notify();
    this.writes = this.writes.then(() => saveCard(card)).catch((e) => console.error("couldn't save card", e));
    return this.writes;
  }

  /** Apply a change to the latest version of a card */
  private update(id: string, change: (card: CardRecord) => CardRecord): Promise<void> {
    const card = this.get(id);
    return card ? this.save(change(card)) : Promise.resolve();
  }

  async addFiles(files: File[]): Promise<IntakeProblem[]> {
    const { cards, problems } = await readFiles(files);
    let order = this.cards.reduce((m, c) => Math.max(m, c.order + 1), 0);
    for (const c of cards) {
      if (this.get(c.id)) {
        problems.push({ name: c.sourceName, message: "Already in the batch." });
        continue;
      }
      const record: CardRecord = {
        id: c.id,
        order: order++,
        sourceName: c.sourceName,
        source: c.image,
        addedAt: new Date().toISOString(),
        status: "processing",
        fields: {},
        others: {},
      };
      await this.save(record);
      this.enqueue(record);
    }
    return problems;
  }

  /** Process cards one at a time, in the order they were added */
  private enqueue(card: CardRecord) {
    this.queue = this.queue.then(() => this.process(card.id));
  }

  private async process(id: string) {
    const card = this.get(id);
    if (!card || card.status !== "processing") return;
    const settings = loadSettings();
    const r = await processInWorker(id, card.source, { readDigits: settings.readDigits, readText: settings.readText });
    const current = this.get(id);
    if (!current) return;
    if (r.status === "read") {
      const fields: Record<string, FieldState> = Object.fromEntries(r.fields.map((f) => [f.fieldId, fieldStateFrom(f)]));
      await this.save({ ...current, status: "review", version: r.version, versionCode: r.versionCode, aligned: r.aligned, fields, others: {} });
    } else {
      const layout = LATEST_LAYOUT;
      await this.save({
        ...current,
        status: "rejected",
        rejectCode: r.status === "rejected" ? r.code : "error",
        rejectMessage: r.message,
        manualEntry: true,
        fields: manualFieldStates(layout),
        others: {},
      });
    }
  }

  setField(id: string, fieldId: string, value: string, accepted: boolean): Promise<void> {
    return this.update(id, (card) => {
      const prev = card.fields[fieldId];
      return { ...card, fields: { ...card.fields, [fieldId]: { ...prev, value, accepted: accepted || prev.accepted } } };
    });
  }

  setOther(id: string, row: number, state: OtherState): Promise<void> {
    return this.update(id, (card) => ({ ...card, others: { ...card.others, [row]: state } }));
  }

  /** Drop the category decision for Other rows that are now empty */
  async pruneOthers(id: string, usedRows: number[]): Promise<void> {
    const card = this.get(id);
    if (!card) return;
    const others = Object.fromEntries(Object.entries(card.others).filter(([row]) => usedRows.includes(Number(row))));
    if (Object.keys(others).length !== Object.keys(card.others).length) await this.update(id, (c) => ({ ...c, others }));
  }

  /**
   * Confirm a card.
   *
   * Returns
   * -------
   * Whether the card was confirmed. False when something still needs attention.
   */
  async confirm(id: string, categories: CategoryService): Promise<boolean> {
    const card = this.get(id);
    if (!card || !canConfirm(card, layoutOf(card))) return false;
    const { others, categoryNames } = await categories.record(card);
    await this.update(id, (c) => ({ ...c, status: "confirmed", others, categoryNames, confirmedAt: new Date().toISOString() }));
    return true;
  }

  /** Reopen a confirmed card for more review */
  reopen(id: string): Promise<void> {
    return this.update(id, ({ confirmedAt: _c, ...rest }) => ({ ...rest, status: rest.manualEntry ? "rejected" : "review" }));
  }

  /**
   * Swap a card's image for a retake, keeping its place in the batch.
   *
   * Returns
   * -------
   * The card's new ID, since IDs come from the image, or null with the
   * problems when the file couldn't be used.
   */
  async replaceImage(id: string, file: File): Promise<{ newId: string | null; problems: IntakeProblem[] }> {
    const card = this.get(id);
    if (!card) return { newId: null, problems: [] };
    const { cards, problems } = await readFiles([file]);
    if (!cards.length) return { newId: null, problems };
    const c = cards[0];
    if (c.id !== id && this.get(c.id)) return { newId: null, problems: [{ name: file.name, message: "Already in the batch." }] };
    await deleteCard(id);
    this.cards = this.cards.filter((x) => x.id !== id);
    const record: CardRecord = {
      id: c.id,
      order: card.order,
      sourceName: c.sourceName,
      source: c.image,
      addedAt: new Date().toISOString(),
      status: "processing",
      fields: {},
      others: {},
    };
    await this.save(record);
    this.enqueue(record);
    return { newId: record.id, problems };
  }

  async clear(): Promise<void> {
    await clearCards();
    this.cards = [];
    this.notify();
  }
}

export const batch = new BatchStore();

/** Re-render whenever the batch changes */
export function useBatch(): BatchStore {
  const [, setTick] = useState(0);
  useEffect(() => batch.subscribe(() => setTick((t) => t + 1)), []);
  return batch;
}
