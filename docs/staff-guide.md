# Card digitizer guide for staff

The card digitizer turns photos and scans of Cleanup Data Cards into a
spreadsheet. It reads what it can, then shows you each value next to the
handwriting it came from, so checking a card is quick. Nothing is sent
anywhere. All the reading happens on your computer.

## Opening the app

Open the app's web address in Chrome, Edge, Firefox, or Safari. There's
nothing to install. After the first visit it also works without internet.

When a new version is published, a blue bar says so. Click **Reload now**
when it suits you. Your work is kept.

## Adding cards

Drag photos, scans, or PDFs onto the box at the top, or click it to choose
files. Each photo is one card. Each page of a PDF is one card.

Photos work best when:

- all four black corner squares are in the picture
- the card is flat
- the light is even, without glare on the card

Each card shows its status in the list:

- **Reading…** The app is still working on it.
- **N need attention** Some values need you to check them.
- **Ready to confirm** Nothing needs checking. Open it to look it over and
  confirm.
- **Couldn't read** The app couldn't line the card up. The reason is shown.
  Retake the photo, or enter the card by hand.
- **Confirmed** Done. It will be in the next export.

## Checking a card

Click **Review** on a card. On the left is every field, with the
handwriting beside the value the app read. Fields that need a look come
first, marked with a yellow bar and a reason, such as "Tally (about 12) and
total (21) disagree". The whole card is on the right, with the current field
outlined.

Use the keyboard to move quickly:

| Key | What it does |
| --- | --- |
| ↓ and ↑ | Next and previous field |
| Type | Change the value |
| Enter | Accept the value and go to the next field needing a look |
| Shift+Enter | Use the suggested value, such as the tally count |
| Alt+1, Alt+2, Alt+3 | Pick one of the offered categories for an Other item |
| Ctrl+Enter (⌘+Enter on Mac) | Confirm the card |
| Page Down and Page Up | Next and previous card |
| Esc | Back to the batch |

Names, locations, and Other items always need you to check them, even when
the app read them. Handwriting is hard to read reliably.

A card can only be confirmed once everything needing a look is accepted. If
you try too early, the app jumps to the first thing left.

## Other items

For each Other item, the app suggests a category from the shared list.

- **Known item** It's been seen before. Press Enter to accept.
- **Close match found** One category is a strong match and is already
  picked. Check it and press Enter.
- **Pick the category** A few categories might fit. Press Alt+1, Alt+2, or
  Alt+3, or type in the search box to find any category.
- **New category** Nothing similar exists yet. Press Enter to make it a new
  category, or search for an existing one.

If an Other item is really a printed category, like "water bottle", pick the
printed category. It's labelled "printed". The export keeps it on its own
row, so nothing is double counted.

## Cards the app couldn't read

Open the card with **Enter by hand**. Either click **Replace image…** and
choose a better photo, or type the values from the original image into the
empty fields, then confirm.

## Exporting

Click **Export CSV** on the batch screen. The file has one row per item
count, per card. Only confirmed cards are included, and the app tells you how
many were left out and why.

Exporting the same card twice gives identical rows, so duplicates are easy
to spot.

When you're done with a batch and have exported it, click **Clear batch**.

## Your work is saved as you go

Every change is saved in this browser right away. Closing the tab or
restarting the computer doesn't lose anything. If you see a yellow warning
that the browser may clear the batch, export confirmed cards often.

## Settings

- **Category sheet address** connects the shared category list. See the
  category sheet setup guide.
- **Read numbers automatically** and **Read handwritten names
  automatically** can be switched off. Fields with writing are then left
  for you to type.
- **Download the printable card** gets the PDF to print.
