/**
 * Read handwritten text with TrOCR through transformers.js.
 *
 * The model is fairly large, so it's only downloaded the first time a card
 * actually has text to read. After that the browser caches it.
 */
import { env, pipeline, RawImage, type ImageToTextPipeline } from "@huggingface/transformers";
import type { RGBA } from "../core/raster";
import type { TextReader } from "./fields";

export const TEXT_MODEL = "Xenova/trocr-small-handwritten";

let reader: Promise<ImageToTextPipeline> | null = null;

/** A text reader that loads the handwriting model on its first use */
export function lazyTextReader(): TextReader {
  return async (crop: RGBA) => {
    env.allowLocalModels = false;
    reader ??= pipeline("image-to-text", TEXT_MODEL, { dtype: "q8" }) as Promise<ImageToTextPipeline>;
    const model = await reader;
    const image = new RawImage(new Uint8ClampedArray(crop.data), crop.width, crop.height, 4).rgb();
    const out = (await model(image)) as { generated_text: string }[];
    return out[0]?.generated_text ?? "";
  };
}

/** Whether the handwriting model has been requested in this session */
export function textModelRequested(): boolean {
  return reader !== null;
}
