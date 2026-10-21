## Why

Keep Tahoe Blue staff type every paper Cleanup Data Card into their database by hand. It's slow, mundane work that takes time away from higher-impact work. An earlier attempt to automate it with general OCR failed for two reasons. Card photos could not be reliably normalized, and the model was often confidently wrong on handwriting done at the beach. This change starts over around two ideas. The card itself is redesigned to be machine-readable. And the tool is built around fast human checking, not blind automation.

## What Changes

- A redesigned Cleanup Data Card that keeps every printed category from the 2022 card. It adds corner alignment markers, a version QR code, per-digit boxes for every number, light "dropout" print color, and roomier "Other" rows. It's delivered as a print-ready PDF.
- A single card definition per card version. Both the printable card and the app's field layout are generated from it, so they can't drift apart.
- A browser app that needs no install and no paid services. Staff open a URL, add card scans or photos, review the results, and export them. All image processing and model inference runs on the staff member's own machine. Updates ship by redeploying the site.
- Card intake that detects the card version and aligns each image to its template. A card that can't be aligned is rejected with a reason instead of being misread.
- Field recognition. It detects blank fields, reads handwritten digits, and flags fields for attention based on disagreement between independent signals, not on model confidence alone.
- A review screen showing each field's cropped image next to an editable value. Flagged fields come first, and the whole screen can be driven from the keyboard.
- Reading of the handwritten "Other" item names and header text fields. These are always shown for human confirmation.
- Merging of "Other" items by intent into a shared, editable category list. Each item is matched against printed categories and against categories volunteers have written before. Confirmed matches become aliases so later matching improves. The list lives in a swappable store. The first backend is a Google Sheet, and the fallback treats the volunteer's raw text as a new category.
- Export of reviewed cards to CSV through a swappable output adapter. KTB's storage has changed several times and may change again.

## Capabilities

### New Capabilities
- `machine-readable-card`: The redesigned printed card, its required features, and the per-version card definition the printable card and app layout are generated from.
- `card-intake`: Adding card images, detecting card version, aligning images to the template, and rejecting cards that can't be aligned.
- `field-recognition`: Blank detection, digit reading, handwritten text reading, and flagging fields that need human attention.
- `card-review`: The review screen where staff check, correct, and confirm each card's values.
- `other-category-coalescing`: Merging handwritten "Other" items by intent into a shared category list, and triaging that list.
- `data-export`: Exporting confirmed card data in a stable format through a swappable output adapter.
- `app-delivery`: How the app runs and is delivered. Static hosting, local-only processing, offline use, and remote updates.

### Modified Capabilities
None. This is the first change in the project.

## Impact

- New codebase. A static TypeScript web app, a card-definition toolchain that emits the printable PDF and layout config, and a small Google Apps Script for the category store.
- New dependencies, all free and run locally. These are an image-processing library, a fiducial and QR decoder, a browser ML runtime, a small digit classifier, a small handwriting model, and a small sentence-embedding model.
- External systems. Free static hosting for the app. A Google Sheet owned by KTB (or a dedicated account) for the shared category list.
- KTB process. Cards printed from the new design. The old 2022 card isn't supported by this change.
