# Keep Tahoe Blue card digitizer

Turns photos and scans of Keep Tahoe Blue's Cleanup Data Cards into checked,
exportable data. It runs entirely in the browser, with nothing to install and
no paid services. Updates ship by redeploying a static site.

The app reads a redesigned, machine-readable card. Corner markers let it
straighten any photo. A QR code says which card version it is. Every number is
written one digit per box. Staff then check each value beside its handwriting,
with uncertain values flagged first, and export a CSV.

- Staff guide: [docs/staff-guide.md](docs/staff-guide.md)
- Category sheet setup: [docs/category-sheet-setup.md](docs/category-sheet-setup.md)
- Printable card: `public/cards/ktb-card-v1.pdf`
- Design and specs: `openspec/changes/build-card-digitizer/`

## Commands

```sh
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest), including the image pipeline on fixtures
npm run test:e2e     # browser tests (Playwright) against a production build
npm run build        # static site in dist/

npm run card         # regenerate the printable card, layout JSON, and blank raster
npm run fixtures     # regenerate the synthetic card photos used by tests
npm run calibrate    # re-pick the Other-item matching thresholds
```

Browser tests need Playwright's browsers once: `npx playwright install`.

## How it fits together

```
photo / scan / PDF page
  │  intake (src/app/intake.ts): hash for a stable card ID, render PDF pages
  ▼
processing worker (src/pipeline/worker.ts)
  │  align (align.ts): ArUco markers → homography → flat card at 6 px/mm
  │  version (version.ts): QR code → card layout
  │  verify (align.ts): printed box edges must sit where the layout says
  │  dropout (dropout.ts): red channel ÷ paper estimate, guides vanish
  │  fields (fields.ts): blank detection, digit CNN, tally estimate, flags, TrOCR
  ▼
review screen (src/ui/ReviewView.tsx) ◄── Other matching (src/categories/)
  │                                        MiniLM embeddings + shared sheet
  ▼
CSV export (src/export/)
```

- `src/cards/` holds the card definitions. `v1.ts` is the only place card
  positions are set. The generator renders it to the PDF and to the layout
  JSON the app loads.
- `src/core/` is pure logic with no browser or OpenCV dependency: ink
  detection, digit preprocessing, tally estimation, flag rules, text
  normalization.
- `src/storage/db.ts` keeps the batch in IndexedDB, so reloads and updates
  never lose work.
- `training/` trains the digit model (Python, `uv`).
- `apps-script/Code.gs` is the Google Sheet category store.

## Maintainer notes

### Shipping an update

Push to `main`. The GitHub Actions workflow runs the unit and browser tests,
builds with the Pages base path, and deploys. Open copies of the app show a
"new version available" banner and reload when staff choose.

The first deploy needs GitHub Pages turned on for the repository, with
**Source** set to **GitHub Actions**.

### Adding a card version

1. Copy `src/cards/v1.ts` to `v2.ts`. Change `version` and `versionCode`, and
   edit the layout. Markers and the QR code must stay where `CARD_FRAME` puts
   them, because the app aligns cards before it knows their version. The
   validator enforces this.
2. Add the new definition to `DEFINITIONS` in `tools/generate-card.ts` and
   run `npm run card`.
3. Import the new layout JSON in `src/pipeline/version.ts`.
4. Keep old layouts. Cards already printed still need them.

Category IDs are stable identifiers in exports. Don't reuse one for a
different category.

### Retraining the digit model

```sh
cd training
uv run python train_digits.py --epochs 6
uv run python make_parity_fixture.py
```

This writes `public/models/digits.onnx` and its metrics in
`public/models/digits.json`. `make_parity_fixture.py` refreshes the test that
keeps the Python and TypeScript preprocessing identical. Once real cards are
collected, fine-tune on crops from them.

### Rotating the category sheet URL

See "If the URL leaks" in the category sheet setup guide.

### Tuning thresholds

- Digit confidence: `DEFAULT_DIGIT_THRESHOLDS` in `src/core/flags.ts`.
- Blank and outside-ink areas: constants at the top of `src/pipeline/fields.ts`.
- Alignment trust: constants above `verifyAlignment` in `src/pipeline/align.ts`.
- Other matching: add labelled pairs to `tools/match-pairs.json`, then run
  `npm run calibrate`.

`tests/unit/recognition.test.ts` prints accuracy for blank detection, values,
and tallies on the fixtures. Run it before and after any change.

## Results on synthetic cards

From `npm test` on the committed fixtures (10 readable cards, 4 that must be
rejected):

- Blank detection: 520 of 520 fields.
- Written values: 207 of 210 read correctly. Wrong values left unflagged: at
  most 1.
- Tally estimates within tolerance: 131 of 139.
- Every misframed, curled, unknown-version, and missing-QR card is rejected
  with the right reason.
- Digit model: 99.05% on augmented held-out EMNIST digits, 431 KB.

These are synthetic. Real accuracy has to come from a pilot with real cards.

## Known limits

- Only cards with the corner markers can be read. The 2022 card isn't
  supported.
- The "Pieces smaller than a quarter" rows collect large counts in a short
  tally area. Very dense tallies (30 or more strokes there) are undercounted.
  The written total is still read normally. A taller tally area for those
  rows would help in the next card version.
- Handwritten names and locations are read by a general handwriting model.
  They always need confirming, and often need correcting.
- Embeddings treat related items as similar ("golf ball" and "tennis ball").
  That's why only very close matches are pre-selected.
- The full browser suite runs in Chromium. Firefox and WebKit run a smoke
  test of the core flow.
