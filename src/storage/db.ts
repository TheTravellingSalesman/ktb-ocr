/**
 * IndexedDB storage for the batch and cached embeddings.
 *
 * Everything lives on the staff member's machine. The browser may evict it
 * unless persistent storage is granted, so the app asks for persistence and
 * warns when it's refused.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CardRecord } from "../model/types";

interface Schema extends DBSchema {
  cards: { key: string; value: CardRecord; indexes: { order: number } };
  embeddings: { key: string; value: { key: string; vector: Float32Array } };
}

const DB_NAME = "ktb-card-digitizer";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      const cards = d.createObjectStore("cards", { keyPath: "id" });
      cards.createIndex("order", "order");
      d.createObjectStore("embeddings", { keyPath: "key" });
    },
  });
  return dbPromise;
}

/** Every card in the batch, in batch order */
export async function loadCards(): Promise<CardRecord[]> {
  return (await db()).getAllFromIndex("cards", "order");
}

export async function getCard(id: string): Promise<CardRecord | undefined> {
  return (await db()).get("cards", id);
}

export async function saveCard(card: CardRecord): Promise<void> {
  await (await db()).put("cards", card);
}

export async function deleteCard(id: string): Promise<void> {
  await (await db()).delete("cards", id);
}

/** Remove every card from the batch */
export async function clearCards(): Promise<void> {
  await (await db()).clear("cards");
}

export async function getEmbedding(key: string): Promise<Float32Array | undefined> {
  return (await (await db()).get("embeddings", key))?.vector;
}

export async function putEmbedding(key: string, vector: Float32Array): Promise<void> {
  await (await db()).put("embeddings", { key, vector });
}

/** Close the connection. Used by tests to start from a fresh database */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

/**
 * Ask the browser to keep the batch from being evicted.
 *
 * Returns
 * -------
 * Whether storage is persistent. False when the browser refused or can't say.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
