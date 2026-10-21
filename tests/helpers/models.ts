import { readFileSync } from "node:fs";
import { loadDigitClassifier } from "../../src/pipeline/digitModel";
import type { DigitClassifier } from "../../src/pipeline/fields";

let classifier: Promise<DigitClassifier> | null = null;

/** The shipped digit model, loaded once per test file */
export function digitClassifier(): Promise<DigitClassifier> {
  classifier ??= loadDigitClassifier(new Uint8Array(readFileSync("public/models/digits.onnx")));
  return classifier;
}
