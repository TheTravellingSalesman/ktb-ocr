/**
 * Settings: the category sheet's address, and switches for recognition.
 */
import { useState } from "preact/hooks";
import type { Settings } from "../app/settings";
import type { CategoryService } from "../app/categories";

interface Props {
  settings: Settings;
  categories: CategoryService | null;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, categories, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const status = !categories
    ? "Connecting…"
    : categories.available
      ? `Connected to the category sheet (${categories.list.active().length} categories).`
      : categories.problem ?? "No category sheet set. Other items become provisional categories.";

  return (
    <div class="dialog-backdrop" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <label class="setting">
          <span>Category sheet address</span>
          <input
            type="url"
            placeholder="https://script.google.com/macros/s/…/exec"
            value={draft.storeUrl}
            onInput={(e) => setDraft({ ...draft, storeUrl: (e.target as HTMLInputElement).value })}
          />
          <span class="muted" data-testid="store-status">
            {status}
          </span>
        </label>
        <label class="check">
          <input type="checkbox" checked={draft.readDigits} onChange={(e) => setDraft({ ...draft, readDigits: (e.target as HTMLInputElement).checked })} />
          Read numbers automatically
        </label>
        <label class="check">
          <input type="checkbox" checked={draft.readText} onChange={(e) => setDraft({ ...draft, readText: (e.target as HTMLInputElement).checked })} />
          Read handwritten names automatically (downloads a model the first time)
        </label>
        <p class="muted">Changes to reading apply to cards added from now on.</p>
        <p>
          <a href={`${import.meta.env.BASE_URL}cards/ktb-card-v1.pdf`} download>
            Download the printable card (version 1)
          </a>
        </p>
        <div class="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button class="primary" onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
