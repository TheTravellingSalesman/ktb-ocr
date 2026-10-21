## Purpose

Gets confirmed card data out of the app in a stable format that KTB can load into whatever storage they use at the time. The format is designed to hold new categories without changing shape.

## ADDED Requirements

### Requirement: Confirmed cards export as long-format CSV
The app SHALL export confirmed cards as a CSV file with one row per non-blank item count, per card. Each row SHALL include:
- a card identifier
- the card version
- the header fields
- section
- category identifier
- category name
- whether the category is printed
- count
- the Other item's raw text, when it came from an Other row
- whether the category is provisional

#### Scenario: Exporting a batch
- **WHEN** a staff member exports a batch of 10 confirmed cards
- **THEN** the downloaded CSV has one row per non-blank item count across those cards, and every row carries its card's header fields

#### Scenario: Other item on a printed category
- **WHEN** a confirmed Other item reading "water bottle" was matched to the printed "Bottles (plastic)" category
- **THEN** its row has that printed category's identifier, the raw text "water bottle", and comes from the Other section, separate from the card's printed "Bottles (plastic)" row

### Requirement: Unconfirmed cards are not exported
Export SHALL include only confirmed cards. It SHALL tell staff how many cards in the batch were left out and why.

#### Scenario: Partial batch
- **WHEN** a batch has 8 confirmed cards and 2 unconfirmed ones, and staff export it
- **THEN** the export contains the 8 confirmed cards, and the app reports that 2 were left out as unconfirmed

### Requirement: Re-exporting is safe
Each card SHALL keep a stable identifier across exports. Exporting the same card twice SHALL produce identical rows, so duplicates can be detected downstream.

#### Scenario: Exporting twice
- **WHEN** the same confirmed card is exported in two separate exports
- **THEN** its rows are identical in both

### Requirement: The export destination is swappable
The app SHALL produce export output only through an output adapter interface. Supporting a different destination SHALL require only a new adapter. CSV download SHALL be the first adapter.

#### Scenario: Selecting an adapter
- **WHEN** the app is configured with the CSV adapter
- **THEN** export downloads a CSV file, and no other part of the app depends on which adapter is chosen
