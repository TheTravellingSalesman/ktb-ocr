## Purpose

Defines the redesigned Cleanup Data Card that volunteers fill out. It keeps KTB's existing categories while making every value reliably machine-readable. It also defines the single card definition that the printable card and the app's field layout both come from.

## ADDED Requirements

### Requirement: Printed categories are preserved
The redesigned card SHALL contain every item category printed on the 2022 Cleanup Data Card, under the same section headings. Categories MAY be reordered within a section only if KTB approves. No category SHALL be removed or renamed without KTB approval.

#### Scenario: Category parity with the 2022 card
- **WHEN** the redesigned card's category list is compared with the 2022 card's category list
- **THEN** every 2022 category appears exactly once, under the section it belonged to

### Requirement: Card carries alignment markers
The card SHALL print four distinct fiducial markers, one near each corner, at fixed positions defined by the card definition.

#### Scenario: Markers present on every page
- **WHEN** a card is printed from the generated PDF
- **THEN** each printed page shows four distinct, decodable fiducial markers near its corners

### Requirement: Card carries a version code
The card SHALL print a machine-readable code that identifies the card version. That version identifies exactly one card definition.

#### Scenario: Version code resolves to a definition
- **WHEN** the version code on a printed card is decoded
- **THEN** it yields a version identifier that matches exactly one card definition shipped with the app

### Requirement: Numbers are written in per-digit boxes
Every numeric value on the card SHALL have a row of boxes that hold one digit each. This covers item totals and the numeric header fields (date, volunteers, duration, pounds, gallons, square miles). Each item category SHALL also have a separate tally area, set apart from its digit boxes.

#### Scenario: Item row layout
- **WHEN** any item category row on the card is inspected
- **THEN** it has a printed label, a tally area, and at least three digit boxes, with clear space between the tally area and the boxes

#### Scenario: Fractional header values
- **WHEN** a header field commonly takes fractional values, such as cleanup duration in hours
- **THEN** its digit boxes include a printed decimal point at a fixed position

### Requirement: Printed guides use a dropout color
Boxes, row lines, and tally areas SHALL be printed in a color that can be removed by image processing without removing typical pen or pencil marks. Labels and alignment markers SHALL stay dark enough to detect.

#### Scenario: Guides vanish under dropout
- **WHEN** a blank printed card is scanned and the dropout filter is applied
- **THEN** the boxes and row lines are no longer visible, and the alignment markers still are

### Requirement: Card has free-text Other rows
The card SHALL provide rows for items not covered by the printed categories. Each row SHALL have a writing area for the item name, a tally area, and digit boxes. The card SHALL ask volunteers to print item names in block letters.

#### Scenario: Other row layout
- **WHEN** the Other section of the card is inspected
- **THEN** each row has a name writing area, a tally area, and digit boxes, plus a printed instruction to use block letters

### Requirement: Printable card and app layout come from one definition
Each card version SHALL be described by one card definition. Both the printable PDF and the app's field layout SHALL be generated from that definition. Field positions SHALL NOT be maintained by hand in two places.

#### Scenario: Regenerating after a layout edit
- **WHEN** a field position is changed in the card definition and the build is re-run
- **THEN** the printable PDF and the app's field layout both reflect the new position

#### Scenario: Generated layout matches the printed card
- **WHEN** a blank card is rendered from the generated PDF and the app's field layout is overlaid on it
- **THEN** every field region lines up with its printed box within a small fixed tolerance
