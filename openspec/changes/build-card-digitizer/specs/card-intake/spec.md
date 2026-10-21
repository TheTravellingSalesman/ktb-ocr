## Purpose

Gets card images into the app and turns each one into a flat, template-aligned card ready for field reading. A card that can't be aligned is refused with a reason, instead of being silently misread.

## ADDED Requirements

### Requirement: Staff can add card images
The app SHALL accept card images as JPEG, PNG, HEIC where the browser supports it, and multi-page PDF. It SHALL accept them by file picker and by drag and drop. Each image or PDF page SHALL be treated as one card.

#### Scenario: Adding a batch of photos
- **WHEN** a staff member drops 20 phone photos onto the app
- **THEN** the app creates 20 cards in its working batch, each linked to its source file

#### Scenario: Adding a multi-page scan
- **WHEN** a staff member adds a PDF with 12 scanned pages
- **THEN** the app creates 12 cards, one per page

#### Scenario: Unsupported file
- **WHEN** a staff member adds a file that is not a supported image or PDF
- **THEN** the app rejects that file with a message naming it, and continues with the others

### Requirement: Card version is detected
The app SHALL detect each card's version from its printed version code and select the matching card definition.

#### Scenario: Known version
- **WHEN** a card image contains a decodable version code for a shipped card definition
- **THEN** the app uses that definition for the card

#### Scenario: Unknown or unreadable version
- **WHEN** the version code is missing, unreadable, or names a version the app doesn't ship
- **THEN** the card is marked "could not read card version", and no field values are produced for it

### Requirement: Card images are aligned to the template
The app SHALL locate the card's alignment markers and transform the image onto the card definition's coordinate space. This SHALL correct rotation, perspective, and scale, including upside-down and sideways photos.

#### Scenario: Angled phone photo
- **WHEN** a card is photographed at an angle, partly rotated, against a cluttered background
- **THEN** the aligned image places every field region over its printed box within the alignment tolerance

#### Scenario: Upside-down scan
- **WHEN** a card is scanned upside down
- **THEN** the aligned image is upright

### Requirement: Cards that cannot be aligned are rejected
The app SHALL reject a card whose alignment can't be established, or whose alignment check fails, with a reason. A rejected card SHALL produce no field values and SHALL stay visible so staff can replace the image or enter it by hand.

#### Scenario: Missing marker
- **WHEN** a corner of the card, including its marker, is cut off in the photo
- **THEN** the card is marked "card not fully in frame", and the rejection is shown in the batch

#### Scenario: Retaking a rejected card
- **WHEN** a staff member replaces a rejected card's image with a new one
- **THEN** the app runs intake again on the new image, keeping the card's place in the batch
