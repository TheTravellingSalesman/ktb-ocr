/**
 * The page's side of the processing worker.
 */
import type { ProcessRequest, ProcessResponse } from "../pipeline/worker";

let worker: Worker | null = null;
const pending = new Map<string, (r: ProcessResponse) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../pipeline/worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

/** Process one card image in the worker */
export async function processInWorker(
  id: string,
  image: Blob,
  options: { readDigits: boolean; readText: boolean },
): Promise<ProcessResponse> {
  const bitmap = await createImageBitmap(image);
  const req: ProcessRequest = {
    id,
    bitmap,
    ...options,
    digitModelUrl: new URL(`${import.meta.env.BASE_URL}models/digits.onnx`, location.href).toString(),
  };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage(req, [bitmap]);
  });
}
