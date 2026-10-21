/// <reference lib="webworker" />
/** Runs the embedding model off the page's thread, caching vectors in IndexedDB */
import { getEmbedding, putEmbedding } from "../storage/db";
import { loadEmbedder } from "./embedder";

const embed = loadEmbedder({ get: getEmbedding, put: putEmbedding });

self.onmessage = async (e: MessageEvent<{ id: number; texts: string[] }>) => {
  try {
    const vectors = await embed(e.data.texts);
    self.postMessage({ id: e.data.id, vectors });
  } catch (err) {
    self.postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
};
