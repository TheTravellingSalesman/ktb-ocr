/**
 * Process one card image from pixels to proposed field values.
 *
 * Steps run in order, and any of the first three can reject the card:
 * align to the template, read the version code, verify the alignment across
 * the whole card, then dropout-filter and read the fields.
 */
import type { CardLayout } from "../cards/schema";
import type { RGBA } from "../core/raster";
import { alignCard, REJECT_MESSAGES, verifyAlignment, type RejectCode } from "./align";
import { dropout } from "./dropout";
import { readFields, type FieldReading, type ReadOptions } from "./fields";
import { layoutFor, readVersionCode } from "./version";

/**
 * The outcome of processing one card.
 *
 * Attributes
 * ----------
 * status : "rejected" | "read"
 * code : RejectCode
 *     Why the card was rejected. Present when rejected.
 * message : str
 *     The rejection in words staff can act on. Present when rejected.
 * layout : CardLayout
 *     The card version's layout. Present when read.
 * aligned : RGBA
 *     The card flattened onto the template. Present when read.
 * fields : list[FieldReading]
 *     What was read from each field. Present when read.
 */
export type ProcessResult =
  | { status: "rejected"; code: RejectCode; message: string }
  | { status: "read"; layout: CardLayout; aligned: RGBA; fields: FieldReading[] };

const reject = (code: RejectCode): ProcessResult => ({ status: "rejected", code, message: REJECT_MESSAGES[code] });

/** Process one card image */
export async function processCard(image: RGBA, options: ReadOptions = {}): Promise<ProcessResult> {
  const aligned = await alignCard(image);
  if (!aligned.ok) return reject(aligned.code);

  const layout = layoutFor(readVersionCode(aligned.aligned, image));
  if (!layout) return reject("unknown-version");

  if (!verifyAlignment(aligned.aligned, layout)) return reject("alignment-failed");

  const gray = await dropout(aligned.aligned);
  const fields = await readFields(layout, gray, options);
  return { status: "read", layout, aligned: aligned.aligned, fields };
}
