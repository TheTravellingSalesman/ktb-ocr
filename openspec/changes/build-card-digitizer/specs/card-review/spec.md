## Purpose

The screen where staff check and correct what the app read, and confirm each card. It's designed so that checking a card is much faster than typing it in, whether or not recognition is accurate.

## ADDED Requirements

### Requirement: Each field is shown with its image
For each field on a card, the review screen SHALL show the cropped image of that field from the aligned card, including its tally area, next to the proposed value in an editable input. The screen SHALL show any flag reasons and suggested values for the field.

#### Scenario: Reviewing a flagged field
- **WHEN** a staff member opens a card with a field flagged "tally and total disagree"
- **THEN** that field shows its crop, the proposed value, the flag reason, and the tally estimate

### Requirement: Fields needing attention come first
The review screen SHALL present flagged fields and unconfirmed text fields before the other fields on a card. It SHALL show how many fields on the card still need attention.

#### Scenario: Starting a card
- **WHEN** a staff member opens a card with 3 flagged fields and 2 text fields
- **THEN** the screen starts on those 5 fields and shows "5 need attention"

### Requirement: Review is fully keyboard-driven
Staff SHALL be able to move between fields, edit a value, accept a value, accept a suggested value, and confirm the card using only the keyboard.

#### Scenario: Keyboard-only card
- **WHEN** a staff member reviews a whole card without touching the mouse
- **THEN** they can reach, edit, and accept every field and confirm the card

### Requirement: The whole card can be checked against its image
The review screen SHALL let staff view the whole aligned card image, with the field being edited highlighted, so they can check the context around any field.

#### Scenario: Checking context
- **WHEN** a staff member opens the full-card view while editing a field
- **THEN** the aligned card image is shown with that field's region highlighted

### Requirement: A card is confirmed only when nothing needs attention
A card SHALL be confirmable only after every flagged field and every non-blank text field has been accepted or edited. Only confirmed cards SHALL be exported.

#### Scenario: Confirming too early
- **WHEN** a staff member tries to confirm a card that still has an unaccepted flagged field
- **THEN** the card isn't confirmed, and the screen moves to that field

### Requirement: Rejected cards can be entered by hand
A card rejected at intake SHALL still be reviewable. The screen SHALL show the original image with an empty input for each field, so staff can enter it by hand and confirm it.

#### Scenario: Manual entry of a rejected card
- **WHEN** a staff member opens a card rejected as "card not fully in frame"
- **THEN** they see the original image and empty inputs for every field, and can confirm the card after filling them

### Requirement: Work in progress survives a reload
Each card's review state SHALL be kept in the browser on the staff member's machine, including edits, acceptances, and confirmations. Closing or reloading the app SHALL NOT lose it. Staff SHALL be able to clear the batch explicitly.

#### Scenario: Accidental reload
- **WHEN** a staff member reloads the app halfway through a batch
- **THEN** the batch reappears with every card's edits and confirmations intact
