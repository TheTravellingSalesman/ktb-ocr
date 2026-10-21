/**
 * Sentence embeddings for matching Other items by meaning.
 *
 * Uses a small MiniLM model through transformers.js. It runs on the staff
 * member's machine. The model is downloaded once, then cached by the browser.
 */
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

/** Embeds texts as unit-length vectors, so a dot product is cosine similarity */
export type Embedder = (texts: string[]) => Promise<Float32Array[]>;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Load the embedding model and return an embedder for it.
 *
 * `cache` optionally stores vectors by text, so a category list's embeddings
 * aren't recomputed every time the app loads.
 */
export function loadEmbedder(cache?: {
  get(key: string): Promise<Float32Array | undefined>;
  put(key: string, v: Float32Array): Promise<void>;
}): Embedder {
  env.allowLocalModels = false;
  extractor ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" }) as Promise<FeatureExtractionPipeline>;

  return async (texts: string[]) => {
    const out: (Float32Array | undefined)[] = await Promise.all(
      texts.map((t) => cache?.get(`${EMBEDDING_MODEL}:${t}`) ?? Promise.resolve(undefined)),
    );
    const missing = texts.map((_, i) => (out[i] ? -1 : i)).filter((i) => i >= 0);
    if (missing.length) {
      const model = await extractor!;
      const result = await model(missing.map((i) => texts[i]), { pooling: "mean", normalize: true });
      const dim = result.dims[result.dims.length - 1];
      const data = result.data as Float32Array;
      for (const [k, i] of missing.entries()) {
        out[i] = data.slice(k * dim, (k + 1) * dim);
        await cache?.put(`${EMBEDDING_MODEL}:${texts[i]}`, out[i]!);
      }
    }
    return out as Float32Array[];
  };
}

/** Cosine similarity of two unit vectors */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
