/**
 * Run the digit classifier with ONNX Runtime.
 *
 * The model takes a batch of 28x28 inputs, ink high, and returns one logit
 * per digit. It's small enough to load instantly and run on any laptop.
 */
import * as ort from "onnxruntime-web/wasm";
import { DIGIT_SIZE } from "../core/digitPrep";
import type { DigitClassifier, DigitGuess } from "./fields";

function softmax(logits: Float32Array, offset: number): number[] {
  let max = -Infinity;
  for (let i = 0; i < 10; i++) max = Math.max(max, logits[offset + i]);
  const exps = Array.from({ length: 10 }, (_, i) => Math.exp(logits[offset + i] - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Load the digit model and return a classifier for it.
 *
 * `model` is the model file's bytes, or a URL the runtime can fetch.
 */
export async function loadDigitClassifier(model: Uint8Array | string): Promise<DigitClassifier> {
  // One thread avoids needing cross-origin isolation on static hosting
  ort.env.wasm.numThreads = 1;
  const session =
    typeof model === "string" ? await ort.InferenceSession.create(model) : await ort.InferenceSession.create(model);

  return async (inputs: Float32Array[]): Promise<DigitGuess[]> => {
    if (inputs.length === 0) return [];
    const px = DIGIT_SIZE * DIGIT_SIZE;
    const batch = new Float32Array(inputs.length * px);
    inputs.forEach((x, i) => batch.set(x, i * px));
    const feeds = { input: new ort.Tensor("float32", batch, [inputs.length, 1, DIGIT_SIZE, DIGIT_SIZE]) };
    const { logits } = await session.run(feeds);
    const data = logits.data as Float32Array;
    return inputs.map((_, i) => {
      const p = softmax(data, i * 10);
      const order = p.map((v, d) => [v, d]).sort((a, b) => b[0] - a[0]);
      return { digit: order[0][1], p1: order[0][0], p2: order[1][0] };
    });
  };
}
