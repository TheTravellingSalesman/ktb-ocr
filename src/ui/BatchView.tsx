/**
 * The batch screen: add cards, see where each one is, export, and clear.
 */
import { useState } from "preact/hooks";
import { layoutOf, useBatch } from "../app/batch";
import { outstanding } from "../app/review";
import { CsvDownloadAdapter, selectForExport } from "../export/adapter";
import type { IntakeProblem } from "../app/intake";
import type { CardRecord } from "../model/types";
import { useObjectUrl } from "./images";

/** The card's status in a few words */
function statusText(card: CardRecord): { text: string; tone: string } {
  switch (card.status) {
    case "processing":
      return { text: "Reading…", tone: "busy" };
    case "rejected":
      return { text: `Couldn't read: ${card.rejectMessage ?? "unknown problem"}`, tone: "error" };
    case "confirmed":
      return { text: "Confirmed", tone: "ok" };
    case "review": {
      const n = outstanding(card, layoutOf(card)).length;
      return n ? { text: `${n} need attention`, tone: "warn" } : { text: "Ready to confirm", tone: "ok" };
    }
  }
}

function Thumb({ card }: { card: CardRecord }) {
  const url = useObjectUrl(card.aligned ?? card.source);
  return url ? <img class="thumb" src={url} alt="" /> : <div class="thumb" />;
}

export function BatchView({ onOpen }: { onOpen: (id: string) => void }) {
  const b = useBatch();
  const [problems, setProblems] = useState<IntakeProblem[]>([]);
  const [adding, setAdding] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const add = async (files: File[]) => {
    if (!files.length) return;
    setAdding(true);
    setProblems(await b.addFiles(files));
    setAdding(false);
  };

  const exportCards = async () => {
    const { included, leftOut } = selectForExport(b.cards);
    if (included.length) await new CsvDownloadAdapter().export(included.map((card) => ({ card, layout: layoutOf(card) })));
    const parts = [
      leftOut.unconfirmed && `${leftOut.unconfirmed} not yet confirmed`,
      leftOut.rejected && `${leftOut.rejected} couldn't be read and weren't entered`,
      leftOut.processing && `${leftOut.processing} still being read`,
    ].filter(Boolean);
    setExportNote(
      `${included.length ? `Exported ${included.length} confirmed card${included.length === 1 ? "" : "s"}.` : "No confirmed cards to export."}` +
        (parts.length ? ` Left out: ${parts.join(", ")}.` : ""),
    );
  };

  const counts = {
    confirmed: b.cards.filter((c) => c.status === "confirmed").length,
    total: b.cards.length,
  };

  return (
    <div class="batch">
      <label
        class={`dropzone ${dragging ? "dragging" : ""}`}
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add([...(e.dataTransfer?.files ?? [])]);
        }}
      >
        <strong>Add card photos or scans</strong>
        <span class="muted">Drop files here, or click to choose. JPEG, PNG, HEIC (where supported), or PDF. Each PDF page is one card.</span>
        <input type="file" multiple accept="image/*,.heic,.heif,application/pdf" data-testid="file-input" onChange={(e) => {
            const input = e.target as HTMLInputElement;
            add([...(input.files ?? [])]);
            // Picking the same file again wouldn't fire a change otherwise
            input.value = "";
          }}
        />
        {adding && <span>Adding…</span>}
      </label>

      {problems.length > 0 && (
        <div class="banner banner-error" role="alert" data-testid="intake-problems">
          <strong>Some files weren't added:</strong>
          <ul>
            {problems.map((p) => (
              <li key={p.name}>
                {p.name}: {p.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="batch-head">
        <h2>
          Batch <span class="muted">({counts.confirmed} of {counts.total} confirmed)</span>
        </h2>
        <span class="spacer" />
        <button class="primary" onClick={exportCards} disabled={!b.cards.length}>
          Export CSV
        </button>
        <button
          onClick={async () => {
            if (confirm("Remove every card from this batch? Export confirmed cards first. This can't be undone.")) {
              await b.clear();
              setExportNote(null);
            }
          }}
          disabled={!b.cards.length}
        >
          Clear batch
        </button>
      </div>
      {exportNote && (
        <div class="banner banner-info" role="status" data-testid="export-note">
          {exportNote}
        </div>
      )}

      {b.cards.length === 0 ? (
        <p class="muted">No cards yet.</p>
      ) : (
        <ul class="cards" data-testid="card-list">
          {b.cards.map((c) => {
            const s = statusText(c);
            return (
              <li key={c.id} class="card-row" data-card-id={c.id} data-status={c.status}>
                <Thumb card={c} />
                <span class="name">{c.sourceName}</span>
                <span class={`status status-${s.tone}`} data-testid="card-status">
                  {s.text}
                </span>
                <button onClick={() => onOpen(c.id)} disabled={c.status === "processing"}>
                  {c.status === "rejected" ? "Enter by hand" : c.status === "confirmed" ? "View" : "Review"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
