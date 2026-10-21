## 1. Project setup and delivery

- [x] 1.1 Scaffold a Vite + TypeScript app with Vitest and Playwright. Verify `npm run build`, `npm test`, and an empty Playwright smoke test all pass
- [ ] 1.2 Add a CI workflow that builds, tests, and deploys the static site to GitHub Pages on every push to main. Verify a push publishes the site and it loads at its URL
- [x] 1.3 Add a service worker that caches the app shell, plus a visible app version and a "new version available, reload" prompt. Verify with a Playwright test that the app loads offline after a first visit, and that the prompt appears after a new build is deployed
- [x] 1.4 Add IndexedDB batch storage with a persistent-storage request and a warning when persistence isn't granted. Verify unit tests round-trip a card record, and that the warning shows when persistence is denied

## 2. Card definition and printable card

- [x] 2.1 Define the card definition schema. It covers page, markers, version code, sections, categories with stable IDs, tally areas, digit boxes (with optional decimal point), and text areas, all in mm. Verify that a schema validation test rejects malformed definitions
- [x] 2.2 Write the v1 card definition with every 2022 category. Verify that a parity test against a hard-coded list of 2022 categories and sections passes
- [x] 2.3 Build the generator that renders a definition to SVG and PDF, with ArUco markers, version QR code, dropout-tint guides, and dark labels. Verify the PDF opens, and that a render shows four markers and a QR code decodable by the app's decoders
- [x] 2.4 Emit the layout JSON from the same generator run. Verify a test that renders the PDF, overlays the layout, and checks every digit box region against the printed box within tolerance
- [ ] 2.5 Print a pilot card and review it with KTB for layout, branding, and dropout tint. Deliver the approved PDF, with any requested changes made through the definition

## 3. Synthetic test fixtures

- [x] 3.1 Build the fixture generator. It fills rendered cards with EMNIST digits, tally strokes, and text, applies warp, rotation, blur, lighting, colour cast, and JPEG compression, and writes ground-truth JSON. Verify a run produces images plus matching ground-truth files for a fixed seed
- [x] 3.2 Generate a committed fixture set, including upside-down, sideways, cropped-corner, and missing-QR cases. Verify the set loads in tests

## 4. Card intake and alignment

- [x] 4.1 Implement file intake for JPEG, PNG, HEIC (where supported), and multi-page PDF by picker and drag and drop, with stable card IDs from content hashes. Verify with Playwright that 20 images make 20 cards, a 12-page PDF makes 12 cards, and an unsupported file is rejected by name
- [x] 4.2 Load OpenCV.js in a worker. Implement ArUco detection, homography from 16 corners, warp to template resolution, and orientation from marker IDs. Verify that fixture tests align angled, rotated, and upside-down cards within tolerance
- [x] 4.3 Implement alignment verification by reprojection error, with rejection reasons such as "card not fully in frame". Verify that cropped-corner fixtures are rejected with the right reason
- [x] 4.4 Implement version code decoding at its template position, with a whole-image fallback, and definition lookup. Verify that missing-QR and unknown-version fixtures are marked "could not read card version"
- [x] 4.5 Implement white balance from the margins, red-channel dropout, and field cropping from the layout. Verify on a blank rendered card that guides are removed, markers remain, and crops match the layout

## 5. Review screen and CSV export (first end-to-end, recognition off)

- [x] 5.1 Build the batch view with per-card status (rejected, needs attention count, confirmed). Verify with Playwright that statuses render for a mixed fixture batch
- [x] 5.2 Build the card review screen, with each field's crop (including its tally area) beside an editable input, and a full-card view highlighting the current field. Verify with Playwright that every field shows its crop and the highlight follows focus
- [x] 5.3 Add keyboard navigation, accept, accept-suggestion, and confirm, plus attention-first ordering. Verify with a Playwright keyboard-only test that a card can be reviewed and confirmed
- [x] 5.4 Enforce the confirmation rule, and support manual entry for rejected cards. Verify with Playwright that confirmation is blocked with an outstanding flag, and that a rejected card can be filled and confirmed
- [x] 5.5 Persist review state on every change. Verify with Playwright that edits and confirmations survive a reload and an app update
- [x] 5.6 Define the output adapter interface and implement the long-format CSV adapter, with the left-out cards report. Verify unit tests for columns, escaping, and Other rows, and that exporting the same card twice gives identical rows
- [x] 5.7 Handle Other rows in naive mode (confirmed raw text becomes a provisional category). Verify with an end-to-end Playwright test that a batch can be added, reviewed by hand, and exported to CSV with provisional Other rows

## 6. Digit recognition and flagging

- [x] 6.1 Implement blank detection by inset-crop ink fraction. Verify fixture tests that blank and non-blank boxes are classified correctly above a target accuracy
- [x] 6.2 Train the digit CNN on augmented EMNIST, export to ONNX, and commit the training script. Verify the held-out digit accuracy is reported, and the model file is under 500 KB
- [x] 6.3 Run the digit model with onnxruntime-web in the worker, and join boxes into values, including the decimal point. Verify fixture tests read multi-digit and fractional values correctly
- [x] 6.4 Implement the tally estimate (stroke count plus group-of-five detection). Verify fixture tests land within tolerance on synthetic tallies
- [x] 6.5 Implement flag rules with reasons and suggestions: low margin, tally/total disagreement, tally without total, gap between boxes, and ink outside boxes. Verify unit tests cover each rule on constructed inputs
- [x] 6.6 Pre-fill review values from recognition, and show flag reasons and suggestions. Verify with Playwright that flagged fields show reasons and the accept-suggestion key works
- [x] 6.7 Verify that recognition makes no network requests, with a Playwright test that records traffic while a batch is processed

## 7. Handwritten text reading

- [x] 7.1 Load trocr-small-handwritten through transformers.js in a worker, only once a card has text to read, cached by the service worker. Verify that the model isn't fetched for a card with no text, and loads offline once cached
- [x] 7.2 Read name, location, and Other item text, and mark every non-blank text field as needing confirmation. Verify with Playwright that text fields show proposals and block confirmation until accepted

## 8. Other category matching

- [x] 8.1 Define the CategoryStore interface and the category and alias model with merge resolution, and implement the null store. Verify unit tests for `merged_into` chains, retired categories, and seeding printed categories
- [x] 8.2 Implement text normalization and exact alias lookup. Verify unit tests for case, whitespace, punctuation, and plural variants
- [x] 8.3 Load MiniLM through transformers.js, embed category names and aliases with an IndexedDB cache, and rank categories by best-match cosine. Verify unit tests show that the wagon/cart, balon/balloons, and water bottle/Bottles (plastic) pairs rank the expected category in the top three
- [x] 8.4 Build the labelled pair set (should merge and shouldn't merge) and a calibration script, and pick the two thresholds. Verify the script reports precision and recall at the chosen thresholds, and the thresholds are committed
- [x] 8.5 Add the match step to the review screen: auto-select, top three, create new, labels for printed categories, and pick any category. Verify with Playwright each of the three outcomes on stubbed scores
- [x] 8.6 Record confirmed aliases and new categories through the store, falling back to provisional categories on failure. Verify unit tests that a store failure produces a provisional, unresolved export row with raw text

## 9. Google Sheet category store

- [ ] 9.1 Write the Apps Script web app (doGet load, doPost addAlias / createCategory / ensurePrinted, with LockService and idempotent writes) and a sheet template with the two tabs. Verify with a manual test against a scratch sheet that concurrent duplicate writes produce a single alias row
- [ ] 9.2 Implement the Sheet backend client (text/plain POST, store URL in settings). Verify unit tests against a mocked endpoint, and a manual test that the app reads and writes the scratch sheet
- [ ] 9.3 Verify by a manual test that renaming, merging, moving an alias, and retiring a category in the sheet are respected on the next app load
- [ ] 9.4 Write the KTB setup guide: copy the sheet, deploy the script, paste the URL into the app. Verify by following it from scratch on a fresh Google account

## 10. Pilot and handoff

- [ ] 10.1 Run a pilot cleanup with printed v1 cards. Collect the photos plus hand-entered ground truth. Deliver a labelled real-card test set
- [ ] 10.2 Tune the blank, margin, and tally thresholds on pilot data, and fine-tune the digit model on pilot crops. Verify a report of per-field accuracy and flag rate before and after tuning
- [ ] 10.3 Measure review time per card against KTB's current manual entry time on the same cards. Deliver the comparison to KTB
- [ ] 10.4 Write the staff user guide and maintainer notes (how to add a card version, ship an update, rotate the store URL). Verify that a KTB staff member completes a batch using only the guide
