/**
 * The batch's data model: cards, their fields, and their review state.
 *
 * A batch belongs to one browser. Everything here is saved in IndexedDB on
 * every change, so a reload or app update never loses review work.
 */
import type { Flag } from "../core/flags";

/** Where a card is in the workflow */
export type CardStatus = "processing" | "rejected" | "review" | "confirmed";

/**
 * The review state of one field.
 *
 * Attributes
 * ----------
 * value : str
 *     What staff have entered or accepted. Starts as the proposed value.
 * proposed : str
 *     What recognition proposed. "" when nothing was proposed.
 * blank : bool
 *     Whether recognition found nothing written in the field.
 * flags : list[Flag]
 *     Why the field needs attention.
 * suggestion : str | None
 *     A value staff can accept with one key, such as a tally estimate.
 * needsAttention : bool
 *     True when the field was flagged, or is a non-blank text field. Fixed
 *     when the card is read.
 * accepted : bool
 *     Whether staff have accepted or edited the field.
 */
export interface FieldState {
  value: string;
  proposed: string;
  blank: boolean;
  flags: Flag[];
  suggestion?: string;
  needsAttention: boolean;
  accepted: boolean;
}

/**
 * One category staff could pick for an Other item.
 *
 * Attributes
 * ----------
 * categoryId : str
 * name : str
 * printed : bool
 *     Whether it's one of the card's printed categories.
 * score : float | None
 *     How close in meaning the item is to the category, from 0 to 1.
 */
export interface CategoryOption {
  categoryId: string;
  name: string;
  printed: boolean;
  score?: number;
}

/**
 * How an Other item was matched to a category.
 *
 * - `exact`: the item's text is a known alias.
 * - `auto`: one category was close enough in meaning to pre-select.
 * - `choose`: a few categories were close. Staff pick one.
 * - `new`: nothing was close. A new category is proposed.
 * - `provisional`: the category store isn't available, so the item's text
 *   becomes a provisional category to merge later.
 */
export type MatchMode = "exact" | "auto" | "choose" | "new" | "provisional";

/**
 * The category decision for one Other row.
 *
 * Attributes
 * ----------
 * row : int
 * matchedText : str
 *     The item text the options were computed for. Matching reruns when the
 *     text changes.
 * mode : MatchMode
 * options : list[CategoryOption]
 *     Categories offered, best first.
 * choice : CategoryOption | None
 *     The selected category. For a new or provisional category, its proposed
 *     name with `categoryId` "new" or "provisional:<text>".
 * accepted : bool
 *     Whether staff have confirmed the choice.
 */
export interface OtherState {
  row: number;
  matchedText: string;
  mode: MatchMode;
  options: CategoryOption[];
  choice?: CategoryOption;
  accepted: boolean;
}

/**
 * One card in the batch.
 *
 * Attributes
 * ----------
 * id : str
 *     Stable across sessions and exports. A hash of the source file's bytes
 *     plus the page number.
 * order : int
 *     Position in the batch.
 * sourceName : str
 *     The file the card came from, with the page for multi-page PDFs.
 * source : Blob
 *     The card image as added.
 * addedAt : str
 *     ISO time the card was added.
 * status : CardStatus
 * rejectCode, rejectMessage : str | None
 *     Why intake rejected the card.
 * version, versionCode : str | None
 *     The card version read from its QR code.
 * aligned : Blob | None
 *     The card flattened onto the template, as JPEG.
 * fields : dict[str, FieldState]
 *     Review state by field ID.
 * others : dict[int, OtherState]
 *     Category decisions by Other row number.
 * categoryNames : dict[str, str]
 *     Category names as they were at confirmation, so re-exports are identical.
 * confirmedAt : str | None
 * manualEntry : bool
 *     Whether the card was rejected and is being entered by hand.
 */
export interface CardRecord {
  id: string;
  order: number;
  sourceName: string;
  source: Blob;
  addedAt: string;
  status: CardStatus;
  rejectCode?: string;
  rejectMessage?: string;
  version?: string;
  versionCode?: string;
  aligned?: Blob;
  fields: Record<string, FieldState>;
  others: Record<number, OtherState>;
  categoryNames?: Record<string, string>;
  confirmedAt?: string;
  manualEntry?: boolean;
}
