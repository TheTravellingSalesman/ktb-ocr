/**
 * The card review screen.
 *
 * Each field's image sits next to an editable value. Fields needing
 * attention come first. Everything can be done from the keyboard:
 *
 * - ↑ / ↓ move between fields
 * - Enter accepts the field and moves to the next one needing attention
 * - Shift+Enter accepts the suggested value
 * - Alt+1, Alt+2, Alt+3 pick an offered category on an Other row
 * - Ctrl+Enter (⌘+Enter on Mac) confirms the card
 * - PageDown / PageUp move to the next or previous card
 * - Escape goes back to the batch
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { TargetedKeyboardEvent } from "preact";
import { batch, layoutOf, useBatch } from "../app/batch";
import type { CategoryService } from "../app/categories";
import { isOutstanding, outstanding, reviewOrder, usedOtherRows, type ReviewItem } from "../app/review";
import type { CardRecord, CategoryOption, OtherState } from "../model/types";
import { FieldCrop, FullCard, itemRegion } from "./images";
import { provisionalId } from "../categories/store";
import { normalizeText } from "../core/normalize";

interface Props {
  id: string;
  categories: CategoryService | null;
  onBack: () => void;
  onOpen: (id: string) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

/** A short label for a review item */
function itemLabel(item: ReviewItem, card: CardRecord): string {
  if (item.kind === "category") {
    const text = card.fields[`other.${item.row}.name`]?.value.trim();
    return `Other item ${item.row} category${text ? ` (${text})` : ""}`;
  }
  return item.field.label;
}

export function ReviewView({ id, categories, onBack, onOpen }: Props) {
  const b = useBatch();
  const card = b.get(id);
  const [focus, setFocus] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLInputElement>());
  // Set while the app moves focus itself, so that focus isn't mistaken for a click
  const movingFocus = useRef(false);

  const layout = card ? layoutOf(card) : null;
  // The order is fixed while the card is open, apart from Other rows being used or emptied
  const usedKey = card && layout ? usedOtherRows(card, layout).join(",") : "";
  const items = useMemo(() => (card && layout ? reviewOrder(card, layout) : []), [id, usedKey, card?.status]);
  const remaining = card && layout ? outstanding(card, layout) : [];
  const readOnly = card?.status === "confirmed";
  const index = b.cards.findIndex((c) => c.id === id);

  // Start on the first item needing attention
  useEffect(() => {
    if (!card || !layout) return;
    const first = items.findIndex((i) => isOutstanding(card, i));
    setFocus(first >= 0 ? first : 0);
    setMessage(null);
  }, [id]);

  useEffect(() => {
    const item = items[focus];
    if (!item) return;
    const el = refs.current.get(item.id);
    movingFocus.current = true;
    el?.focus();
    movingFocus.current = false;
    el?.closest(".item")?.scrollIntoView({ block: "nearest" });
  }, [focus, items]);

  // Keep Other rows' category matches in step with their text
  useEffect(() => {
    if (!card || !layout || !categories || readOnly) return;
    const used = usedOtherRows(card, layout);
    b.pruneOthers(card.id, used);
    const timer = setTimeout(async () => {
      for (const row of used) {
        // Read the card afresh. Staff may have accepted a choice since this was scheduled
        const fresh = b.get(card.id);
        if (!fresh) return;
        const text = fresh.fields[`other.${row}.name`]?.value.trim() ?? "";
        const state = fresh.others[row];
        if (state && state.matchedText === text) continue;
        const m = text ? await categories.match(text) : { mode: "new" as const, options: [], choice: undefined };
        await b.setOther(card.id, row, { row, matchedText: text, mode: m.mode, options: m.options, choice: m.choice, accepted: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [card, categories]);

  if (!card || !layout) return <p>That card isn't in the batch.</p>;

  const move = (to: number) => setFocus(Math.max(0, Math.min(items.length - 1, to)));
  const nextNeeding = () => {
    for (let k = 1; k <= items.length; k++) {
      const j = (focus + k) % items.length;
      const fresh = b.get(id)!;
      if (isOutstanding(fresh, items[j])) return j;
    }
    return Math.min(items.length - 1, focus + 1);
  };

  const confirm = async () => {
    if (readOnly) return;
    if (!categories) return setMessage("Still connecting to the category list. Try again in a moment.");
    const ok = await b.confirm(id, categories);
    if (ok) {
      setMessage(null);
      const next = b.cards.find((c, i) => i > index && (c.status === "review" || c.status === "rejected"));
      if (next) onOpen(next.id);
      else onBack();
    } else {
      const fresh = b.get(id)!;
      const left = outstanding(fresh, layout);
      setMessage(`${left.length} still need attention. Moved to the first one.`);
      move(items.findIndex((i) => i.id === left[0]?.id));
    }
  };

  // Batch changes apply in memory at once, so focus can move without waiting for the save
  const acceptItem = (item: ReviewItem, value?: string) => {
    if (readOnly) return;
    if (item.kind === "field") {
      const current = b.get(id)!.fields[item.id];
      b.setField(id, item.id, value ?? current.value, true);
    } else {
      const state = b.get(id)!.others[item.row];
      if (state?.choice) b.setOther(id, item.row, { ...state, accepted: true });
      else return setMessage("Pick a category first, or type a new category name.");
    }
    setMessage(null);
    move(nextNeeding());
  };

  const onKeyDown = (e: TargetedKeyboardEvent<HTMLDivElement>) => {
    const item = items[focus];
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Enter" && mod) {
      e.preventDefault();
      confirm();
    } else if (e.key === "Enter" && e.shiftKey && item?.kind === "field") {
      e.preventDefault();
      const s = b.get(id)!.fields[item.id]?.suggestion;
      if (s !== undefined) acceptItem(item, s);
    } else if (e.key === "Enter" && item) {
      e.preventDefault();
      acceptItem(item);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(focus + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(focus - 1);
    } else if (e.key === "PageDown" && index < b.cards.length - 1) {
      e.preventDefault();
      onOpen(b.cards[index + 1].id);
    } else if (e.key === "PageUp" && index > 0) {
      e.preventDefault();
      onOpen(b.cards[index - 1].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onBack();
    } else if (e.altKey && /^Digit[1-3]$/.test(e.code) && item?.kind === "category") {
      e.preventDefault();
      const option = b.get(id)!.others[item.row]?.options[Number(e.code.slice(5)) - 1];
      if (option) {
        b.setOther(id, item.row, { ...b.get(id)!.others[item.row], choice: option, accepted: true });
        move(nextNeeding());
      }
    }
  };

  const focused = items[focus];
  return (
    <div class="review" onKeyDown={onKeyDown}>
      <div class="review-head">
        <button class="link" onClick={onBack}>
          ← Batch
        </button>
        <h2>{card.sourceName}</h2>
        <span class="muted">
          Card {index + 1} of {b.cards.length}
        </span>
        {!readOnly && (
          <span class={`attention ${remaining.length ? "" : "done"}`} data-testid="attention-count">
            {remaining.length ? `${remaining.length} need attention` : "Ready to confirm"}
          </span>
        )}
        <span class="spacer" />
        {readOnly ? (
          <button onClick={() => b.reopen(id)}>Reopen for changes</button>
        ) : (
          <button class="primary" onClick={confirm} title={`${MOD}+Enter`}>
            Confirm card <kbd>{MOD}+Enter</kbd>
          </button>
        )}
      </div>
      {message && (
        <div class="banner banner-warn" role="alert">
          {message}
        </div>
      )}
      {card.status === "rejected" && <RejectedBanner card={card} onReplaced={onBack} />}
      {readOnly && <div class="banner banner-ok">Confirmed. It will be included in the next export.</div>}
      <p class="keys muted">
        <kbd>↑</kbd>/<kbd>↓</kbd> move · <kbd>Enter</kbd> accept · <kbd>Shift+Enter</kbd> use suggestion · <kbd>Alt+1–3</kbd> pick category ·{" "}
        <kbd>PgUp</kbd>/<kbd>PgDn</kbd> cards · <kbd>Esc</kbd> back
      </p>
      <div class="review-body">
        <ol class="items" data-testid="review-items">
          {items.map((item, i) => (
            <li
              key={item.id}
              class={`item ${i === focus ? "focused" : ""} ${isOutstanding(card, item) ? "outstanding" : ""}`}
              data-item-id={item.id}
              onFocusIn={() => {
                if (!movingFocus.current) setFocus(i);
              }}
            >
              {item.kind === "field" ? (
                <FieldRow card={card} item={item} readOnly={readOnly} inputRef={(el) => (el ? refs.current.set(item.id, el) : refs.current.delete(item.id))} />
              ) : (
                <CategoryRow
                  card={card}
                  row={item.row}
                  categories={categories}
                  readOnly={readOnly}
                  inputRef={(el) => (el ? refs.current.set(item.id, el) : refs.current.delete(item.id))}
                />
              )}
              {card.aligned && <FieldCrop aligned={card.aligned} region={itemRegion(item, layout)} label={itemLabel(item, card)} />}
            </li>
          ))}
        </ol>
        <div class="side">
          <FullCard image={card.aligned ?? card.source} aligned={!!card.aligned} layout={layout} highlight={focused ? itemRegion(focused, layout) : undefined} />
        </div>
      </div>
    </div>
  );
}

function RejectedBanner({ card, onReplaced }: { card: CardRecord; onReplaced: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div class="banner banner-error" role="alert">
      <strong>This card couldn't be read.</strong> {card.rejectMessage} Replace the image with a retake, or enter the values below by hand.
      <label class="button">
        Replace image…
        <input
          type="file"
          accept="image/*,.heic,.heif,application/pdf"
          hidden
          onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) {
              const { newId, problems } = await batch.replaceImage(card.id, f);
              setProblem(problems.map((p) => `${p.name}: ${p.message}`).join(" ") || null);
              // The retake is read like a new card, so go back to the batch to watch it
              if (newId) onReplaced();
            }
          }}
        />
      </label>
      {problem && <div>{problem}</div>}
    </div>
  );
}

interface RowProps {
  card: CardRecord;
  readOnly: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
}

function FieldRow({ card, item, readOnly, inputRef }: RowProps & { item: Extract<ReviewItem, { kind: "field" }> }) {
  const state = card.fields[item.id];
  if (!state) return null;
  const f = item.field;
  const numeric = f.kind === "number";
  return (
    <div class="field">
      <label class="field-label" for={`in-${item.id}`}>
        {f.label}
        {state.accepted && <span class="tick" aria-label="accepted"> ✓</span>}
      </label>
      <input
        id={`in-${item.id}`}
        ref={inputRef}
        data-field-id={item.id}
        type="text"
        inputMode={numeric && f.format !== "date" ? "decimal" : "text"}
        autocomplete="off"
        value={state.value}
        readOnly={readOnly}
        placeholder={state.blank ? "blank" : ""}
        onInput={(e) => batch.setField(card.id, item.id, (e.target as HTMLInputElement).value, true)}
      />
      {state.flags.length > 0 && (
        <ul class="flags">
          {state.flags.map((fl) => (
            <li key={fl.code} class="flag" data-flag={fl.code}>
              {fl.message}
            </li>
          ))}
        </ul>
      )}
      {state.suggestion !== undefined && !readOnly && (
        <button class="suggestion" tabIndex={-1} onClick={() => batch.setField(card.id, item.id, state.suggestion!, true)}>
          Use {state.suggestion} <kbd>Shift+Enter</kbd>
        </button>
      )}
    </div>
  );
}

const MODE_TEXT: Record<OtherState["mode"], string> = {
  exact: "Known item.",
  auto: "Close match found.",
  choose: "Pick the category this belongs to, or type a new one.",
  new: "Nothing similar yet. It will become a new category.",
  provisional: "No category sheet connected, so this becomes a provisional category to merge later.",
};

function CategoryRow({ card, row, categories, readOnly, inputRef }: RowProps & { row: number; categories: CategoryService | null }) {
  const state = card.others[row];
  const [search, setSearch] = useState("");
  const text = card.fields[`other.${row}.name`]?.value.trim() ?? "";
  const results: CategoryOption[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !categories) return [];
    return categories.allCategories().filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [search, categories]);

  const choose = (choice: CategoryOption) => {
    if (!state) return;
    batch.setOther(card.id, row, { ...state, choice, accepted: true });
    setSearch("");
  };

  return (
    <div class="field category" data-testid={`category-${row}`}>
      <label class="field-label" for={`in-other.${row}.category`}>
        Other item {row} category{text ? `: “${text}”` : ""}
        {state?.accepted && <span class="tick" aria-label="accepted"> ✓</span>}
      </label>
      {!state ? (
        <p class="muted">Matching…</p>
      ) : (
        <>
          <p class="muted" data-mode={state.mode}>
            {MODE_TEXT[state.mode]}
          </p>
          {state.choice && (
            <p class="choice">
              Category: <strong data-testid={`choice-${row}`}>{state.choice.name}</strong>
              {state.choice.printed && <span class="badge">printed</span>}
              {state.choice.categoryId === "new" && <span class="badge">new</span>}
              {state.choice.categoryId.startsWith("provisional:") && <span class="badge">provisional</span>}
            </p>
          )}
          {state.options.length > 0 && (
            <div class="options">
              {state.options.map((o, i) => (
                <button key={o.categoryId} tabIndex={-1} disabled={readOnly} class={state.choice?.categoryId === o.categoryId ? "chosen" : ""} onClick={() => choose(o)}>
                  <kbd>Alt+{i + 1}</kbd> {o.name}
                  {o.printed && <span class="badge">printed</span>}
                </button>
              ))}
            </div>
          )}
          {!readOnly && (
            <input
              id={`in-other.${row}.category`}
              ref={inputRef}
              data-field-id={`other.${row}.category`}
              data-category-search="1"
              type="text"
              autocomplete="off"
              placeholder="Search all categories, or type a new name"
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                // Enter on an empty search falls through to accepting the current choice
                if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || !search.trim()) return;
                e.preventDefault();
                e.stopPropagation();
                if (results[0]) choose(results[0]);
                else choose({ categoryId: categories?.available ? "new" : provisionalId(normalizeText(search)), name: search.trim(), printed: false });
              }}
            />
          )}
          {results.length > 0 && (
            <ul class="results">
              {results.map((r) => (
                <li key={r.categoryId}>
                  <button tabIndex={-1} onClick={() => choose(r)}>
                    {r.name}
                    {r.printed && <span class="badge">printed</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
