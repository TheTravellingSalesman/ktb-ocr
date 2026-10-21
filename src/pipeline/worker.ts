/// <reference lib="webworker" />
/**
 * The processing worker. Every card is aligned, filtered, and read here, so
 * the page stays responsive while OpenCV and the models work.
 */
import type { FieldReading } from "./fields";
import { loadDigitClassifier } from "./digitModel";
import { processCard } from "./process";
import { lazyTextReader } from "./textModel";
import type { DigitClassifier } from "./fields";

/**
 * A request to process one card.
 *
 * Attributes
 * ----------
 * id : str
 *     The card's ID, echoed back in the response.
 * bitmap : ImageBitmap
 *     The decoded card image, transferred to the worker.
 * readDigits : bool
 *     Whether to run the digit model.
 * readText : bool
 *     Whether to run the handwriting model.
 * digitModelUrl : str
 */
export interface ProcessRequest {
  id: string;
  bitmap: ImageBitmap;
  readDigits: boolean;
  readText: boolean;
  digitModelUrl: string;
}

export type ProcessResponse =
  | { id: string; status: "rejected"; code: string; message: string }
  | { id: string; status: "read"; version: string; versionCode: string; aligned: Blob; fields: FieldReading[] }
  | { id: string; status: "error"; message: string };

/** Largest side cards are processed at. Bigger photos only cost memory */
const MAX_SIDE = 3200;

let classifier: Promise<DigitClassifier> | null = null;
const readText = lazyTextReader();

function toImageData(bitmap: ImageBitmap) {
  const s = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * s);
  const h = Math.round(bitmap.height * s);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

async function handle(req: ProcessRequest): Promise<ProcessResponse> {
  const image = toImageData(req.bitmap);
  if (req.readDigits) classifier ??= loadDigitClassifier(req.digitModelUrl);
  const result = await processCard(
    { width: image.width, height: image.height, data: image.data },
    { classifyDigits: req.readDigits ? await classifier! : undefined, readText: req.readText ? readText : undefined },
  );
  if (result.status === "rejected") return { id: req.id, ...result };

  const canvas = new OffscreenCanvas(result.aligned.width, result.aligned.height);
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(result.aligned.data), result.aligned.width, result.aligned.height), 0, 0);
  const aligned = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  return { id: req.id, status: "read", version: result.layout.version, versionCode: result.layout.versionCode, aligned, fields: result.fields };
}

// Cards are processed one at a time, so memory stays bounded on modest laptops
let queue = Promise.resolve();
self.onmessage = (e: MessageEvent<ProcessRequest>) => {
  queue = queue.then(async () => {
    let response: ProcessResponse;
    try {
      response = await handle(e.data);
    } catch (err) {
      response = { id: e.data.id, status: "error", message: err instanceof Error ? err.message : String(err) };
    }
    self.postMessage(response);
  });
};
