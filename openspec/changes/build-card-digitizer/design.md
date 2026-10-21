## Context

See proposal.md for motivation. The hard constraints shape everything here:
- It runs on a typical KTB staff computer.
- It has no cloud compute and no paid model or service subscriptions.
- It's easy to hand to KTB.
- It can be patched remotely.

KTB's storage has changed several times, so nothing should couple to it. Card volume is assumed to be in the hundreds to low thousands per season. Throughput isn't a concern, but the time staff spend per card is.

The previous attempt ran general OCR on whole-page photos. This design replaces that with known regions on an aligned template, recognizers limited to what each field can contain, and a human checking every uncertain value.

## Goals / Non-Goals

**Goals:**
- Make checking a card meaningfully faster than typing it, even before recognition is good.
- Fail loudly. A card that can't be aligned is rejected, never guessed at.
- Keep every swappable boundary narrow. That covers card versions, the category store, and the export destination.
- Keep all heavy work in the browser, off the main thread.

**Non-Goals:**
- Supporting the 2022 card or any card without alignment markers. Registration is built so that a marker-less layout with feature-based alignment could be added later.
- Writing directly into KTB's current database. CSV is the boundary until KTB's target is settled.
- An in-app screen for triaging the category list. The spreadsheet is that screen.
- A phone capture flow. Phone photos are supported as input, but the app is designed for laptop and desktop screens.
- Sharing a batch between staff members. A batch belongs to one browser.
- Training or fine-tuning the handwriting text model.

## Decisions

### 1. A static web app, deployed as an offline-capable PWA
The app is TypeScript, built with Vite into static files and hosted for free (GitHub Pages). A service worker caches the app shell and model files, so it works offline after first load. When the service worker sees a new version, it shows a "new version available, reload" prompt.

- *Alternative: a desktop app (Electron, or Python with PyInstaller).* This means installers per OS, code-signing friction, and an update mechanism to build. That's harder to deliver and harder to patch.
- *Alternative: a hosted server.* This costs money, someone has to run it, and card images would leave the machine.

### 2. One card definition generates both the PDF and the layout
Each card version is a TypeScript or JSON definition. It lists the page size, marker IDs and positions, version code, sections, categories (each with a stable ID such as `bottles-plastic`), and the positions of every label, tally area, digit box, and text area. All positions are in millimetres on the page. A build script renders the definition to SVG and then to a print-ready PDF. The same script emits the layout JSON the app loads.

- *Alternative: design the card in a graphics tool and measure field positions by hand.* That puts the same facts in two places, and they will drift apart.

The 2022 card's look should be kept where possible (logo, section bars, colour scheme) so KTB and volunteers recognize it.

### 3. Alignment uses ArUco markers, with a verification check
Four ArUco markers from the 4×4 dictionary, each with a distinct ID, sit in the corners. Each ID tells us which corner it is, which fixes orientation, including upside-down and sideways photos. OpenCV.js (WASM) detects the markers. The app fits a homography from all 16 marker corners and warps the image onto the template at a fixed resolution. Alignment passes only when all four markers are found and the reprojection error is under a threshold. Otherwise the card is rejected with a reason.

The version QR code sits at a known template position. It's decoded from the aligned image. If that fails, the app falls back to scanning the whole image.

- *Alternative: feature matching (ORB/SIFT) against the blank template.* No card changes are needed, but it's much less reliable on crumpled, angled phone photos. It's held back for possible legacy-card support.

### 4. Dropout guides are printed in a light red tint, and removed with the red channel
Boxes, row lines, and tally areas are printed in a light red or salmon tint. Light red is nearly white in the red channel, so taking the red channel after white balance removes the guides. Black pen, blue pen, and pencil all stay dark in that channel. White balance uses the card's unprinted margins, which corrects colour casts in phone photos.

- *Alternative: light blue guides, which match KTB's brand.* Blue dropout uses the blue channel, which also erases blue pens, and blue pens are common. Red pens vanish under red dropout, but they're rare.

### 5. Digits are read by a small CNN, with blank detection first
Each digit box is cropped with an inset margin so leftover box edges are excluded, then dropout-filtered and binarized. A box is blank when its ink fraction is below a threshold. Non-blank boxes go to a small CNN, an MNIST-class network of about 100 KB in ONNX, run through `onnxruntime-web` in a Web Worker.

The model is trained on EMNIST digits, augmented to look like pen-in-a-box crops. Later it's fine-tuned on real crops collected during the pilot. A field is flagged as uncertain when its top reading's probability, or the margin between its top two readings, falls below thresholds tuned on pilot data.

- *Alternative: a general handwriting model (TrOCR) on the whole field.* It's heavier, and it isn't limited to digits. Unconstrained output is exactly what caused the earlier confident misreads.

### 6. The tally estimate is a weak, separate signal
After dropout, the tally area's connected strokes are counted. A long diagonal stroke crossing four upright strokes is treated as a group of five. The estimate is only used to raise flags and offer suggestions. It never sets a value on its own. Disagreement means the estimate and the total differ by more than max(2, 20%).

Volunteers who write numbers in the tally area will often cause a disagreement flag. That's acceptable, because the reviewer sees the crop.

### 7. Text is read by TrOCR-small through transformers.js, loaded lazily
Name, location, and Other item text go to `trocr-small-handwritten` (quantized ONNX through transformers.js) in a worker. The model is only downloaded the first time a card has text to read, and then cached. Text always needs confirmation, so this model's accuracy affects how fast review goes, never whether the data is correct.

### 8. Intent matching uses MiniLM sentence embeddings
`all-MiniLM-L6-v2` (quantized, through transformers.js) embeds item text and every category name and alias. Embeddings are computed when the category list loads and cached in IndexedDB by text. Text is normalized before alias lookup and embedding: lowercase, trim, collapse whitespace, strip punctuation, and naive singularization.

A category's score is the highest cosine similarity across its name and aliases. The two thresholds (pre-select, and offer-or-create) are set from a hand-labelled set of item pairs that should and shouldn't merge. That set includes cases like wagon/cart, balon/balloons, water bottle/Bottles (plastic), and golf ball/tennis ball. We don't guess the thresholds.

- *Alternative: a small local LLM (e.g. through WebLLM).* It's a 1–2 GB download and needs a GPU-capable machine, which breaks the "typical machine" constraint. Embeddings plus human confirmation is enough.

### 9. The category store is an interface, with a Google Sheet as the first backend
```ts
interface CategoryStore {
  load(): Promise<{ categories: Category[]; aliases: Alias[] }>;
  addAlias(text: string, categoryId: string): Promise<void>;
  createCategory(c: { id: string; name: string; firstAlias: string }): Promise<void>;
  ensurePrinted(cats: { id: string; name: string }[]): Promise<void>;
}
```
**Sheet backend.** A Google Sheet has two tabs:
- `Categories`: `id`, `name`, `printed`, `status` (active / retired / merged), `merged_into`
- `Aliases`: `text`, `category_id`, `added_at`

A small Apps Script attached to the sheet is deployed as a web app. It serves `doGet` (load) and `doPost` (writes). Writes use `LockService` and are idempotent. Adding an existing alias does nothing, and new category IDs are UUIDs generated by the client. The browser posts with a `text/plain` body to avoid CORS preflight. The deployment URL is entered once in the app's settings and acts as a shared secret.

**Null backend.** Used when nothing is configured or a request fails. It returns only the printed categories and makes provisional categories locally.

Merged categories are resolved by following `merged_into` when the list loads. Sheet edits by staff are simply picked up on the next load.

- *Alternative: the Sheets API with Google sign-in (OAuth).* Access control is stronger, but it needs a Google Cloud project and a consent screen, and every staff member has to sign in. We can switch to it later behind the same interface.
- *Alternative: a free hosted database (Firebase, Supabase).* It adds an account and a vendor, and loses the "edit it in a spreadsheet" triage that KTB staff can already do.

### 10. Batch state and stable card IDs live in IndexedDB
Source images (as blobs), aligned images, proposed values, flags, and review state are stored in IndexedDB on every change. The card ID is a SHA-256 hash of the source file's bytes plus the page index. That makes re-exports identical, and makes adding the same file twice detectable. The app asks for persistent storage (`navigator.storage.persist()`). It warns when storage isn't persistent, since Safari may evict it.

### 11. Export goes through an output adapter
```ts
interface OutputAdapter { export(cards: ConfirmedCard[]): Promise<void>; }
```
The first adapter writes long-format CSV with the columns listed in the data-export spec, and downloads it. Long format means new Other categories add rows, not columns.

### 12. Processing pipeline and threading
Each card goes through: decode, align, verify, dropout, crop fields, then recognize, in a dedicated worker. OpenCV.js and the ONNX runtimes load inside workers. The UI thread only renders. Cards process one at a time, so memory stays bounded on modest laptops.

### 13. Testing is built on synthetic cards, then a pilot
A fixture generator takes PDFs rendered from the card definition and fills them with EMNIST digits, tally strokes, and handwritten-style text. It then applies perspective warp, rotation, blur, uneven lighting, colour cast, and JPEG compression, and emits ground-truth JSON. Unit tests (Vitest) cover alignment, cropping, blank detection, flag rules, normalization, matching, store resolution, and CSV. Playwright covers the end-to-end flow. A pilot with real filled cards sets the recognition thresholds and provides fine-tuning crops.

## Risks / Trade-offs

- [KTB doesn't adopt the redesigned card] → Pilot it at one cleanup first, with printed cards supplied. Keep the 2022 card's look. The review screen still gives value with recognition off.
- [Volunteers write outside the boxes or ignore the instructions] → "Writing outside boxes" and "tally but no total" flags. Make the boxes large and add a worked example on the card.
- [Red-pen entries disappear under dropout] → Rare. If it happens, the box looks blank but the tally area has marks, which raises a flag. Ask coordinators to hand out dark pens.
- [Phone photo glare or shadows hide ink] → White balance and local normalization. Glare that hides a marker causes a rejection, not a misread.
- [Embedding similarity merges related but different items, like golf ball and tennis ball] → Humans confirm every non-exact match. Thresholds are set from labelled pairs. Merges can be undone in the sheet, and raw text is always exported.
- [The Apps Script URL leaks] → The data is only category names. Redeploying the script makes a new URL. OAuth stays available behind the same interface.
- [Model download size (~100 MB total) on a slow connection] → The text and embedding models load only when needed and are cached by the service worker. The digit model is tiny.
- [Browser storage gets evicted] → Request persistent storage, warn when it isn't granted, and make export easy at any time.
- [Weak tally estimates create noisy flags] → They're only used for flags and suggestions. Tune the tolerance on pilot data. Disable it per field type if it proves too noisy.

## Migration Plan

1. Ship the card generator and print pilot cards. Run the app with only alignment, cropping, review, and CSV, with recognition off. This proves the alignment and review flow at a real cleanup.
2. Turn on digit recognition and flagging. Tune thresholds on pilot cards.
3. Add text reading and Other matching, starting with the null store. Then connect the Sheet backend once KTB picks an account to own it.
4. KTB reprints the card for general use.

Rollback is trivial at every step. KTB's existing manual process is unchanged, and each feature can be switched off by configuration.

## Open Questions

- What storage and column layout does KTB currently use? This only affects which output adapter comes after CSV.
- When an Other item matches a printed category, should KTB add it to the printed count? The export carries both separately, so this is a downstream reporting choice.
- Which Google account should own the category sheet: KTB's Workspace, if they have one, or a dedicated free account?
- Will KTB approve the exact dropout tint, and the final card layout, alongside their brand guidelines?
