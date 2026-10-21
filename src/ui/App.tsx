/**
 * The app shell: top bar, banners, and switching between the batch and a card.
 *
 * The open card is kept in the URL hash, so a reload returns to it.
 */
import { useEffect, useState } from "preact/hooks";
import { batch } from "../app/batch";
import { CategoryService } from "../app/categories";
import type { Embedder } from "../categories/embedder";
import { loadSettings, saveSettings, type Settings } from "../app/settings";
import { requestPersistence } from "../storage/db";
import { BatchView } from "./BatchView";
import { ReviewView } from "./ReviewView";
import { SettingsDialog } from "./SettingsDialog";
import { UpdatePrompt } from "./UpdatePrompt";

const cardFromHash = () => new URLSearchParams(location.hash.slice(1)).get("card");

/** End-to-end tests can supply a fake embedder, so they don't download the real model */
const testEmbedder = () => (globalThis as { __ktbTestEmbed?: Embedder }).__ktbTestEmbed;

export function App() {
  const [open, setOpen] = useState<string | null>(cardFromHash());
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [categories, setCategories] = useState<CategoryService | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [persistent, setPersistent] = useState(true);

  useEffect(() => {
    batch.init();
    requestPersistence().then(setPersistent);
    const onHash = () => setOpen(cardFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setCategories(null);
    CategoryService.connect(settings.storeUrl, testEmbedder()).then(setCategories);
  }, [settings.storeUrl]);

  const go = (id: string | null) => {
    location.hash = id ? `card=${encodeURIComponent(id)}` : "";
    setOpen(id);
  };

  return (
    <div class="app">
      <header class="topbar">
        <h1>
          <button class="link home" onClick={() => go(null)}>
            KTB Card Digitizer
          </button>
        </h1>
        <span class="spacer" />
        <span class="version">Version {__APP_VERSION__}</span>
        <button onClick={() => setShowSettings(true)}>Settings</button>
      </header>
      <UpdatePrompt />
      {!persistent && (
        <div class="banner banner-warn" role="status" data-testid="storage-warning">
          This browser may clear the batch if it runs low on space. Export confirmed cards regularly.
        </div>
      )}
      {categories?.problem && (
        <div class="banner banner-warn" role="status">
          {categories.problem}
        </div>
      )}
      <main>{open ? <ReviewView id={open} categories={categories} onBack={() => go(null)} onOpen={go} /> : <BatchView onOpen={go} />}</main>
      {showSettings && (
        <SettingsDialog
          settings={settings}
          categories={categories}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            saveSettings(s);
            setSettings(s);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
