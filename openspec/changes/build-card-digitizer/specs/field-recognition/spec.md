## Purpose

Reads every field of an aligned card and proposes a value for each one. It also decides which fields a human needs to look at. Flags come from disagreement between independent signals, not from a model's own confidence alone.

## ADDED Requirements

### Requirement: Blank fields are detected
For every numeric field, the app SHALL decide whether the volunteer wrote anything in its digit boxes. A field with no ink in its boxes and no ink in its tally area SHALL be proposed as blank. Blank means zero items recorded.

#### Scenario: Untouched row
- **WHEN** an item row has no marks in its tally area or digit boxes
- **THEN** the field is proposed as blank and isn't flagged

### Requirement: Handwritten digits are read
For every numeric field with ink in its digit boxes, the app SHALL read one digit per box and join the non-blank boxes, left to right, into the field's value. Reading SHALL only produce the digits 0–9. A printed decimal point in a field's layout SHALL be kept in the value.

#### Scenario: Two-digit total
- **WHEN** a volunteer writes "1" and "7" in the first two boxes of a row and leaves the third blank
- **THEN** the proposed value is 17

#### Scenario: Fractional duration
- **WHEN** a volunteer writes "2" before the printed decimal point and "5" after it in the duration field
- **THEN** the proposed value is 2.5

### Requirement: Uncertain fields are flagged with a reason
The app SHALL flag a field for review when any of these hold, and SHALL record each reason:
- the digit reading isn't clearly ahead of its next-best reading
- the tally estimate and the written total disagree beyond a tolerance
- the tally area has marks but the digit boxes are empty
- there is a blank box between non-blank boxes
- there is significant ink near the field that's outside its boxes

#### Scenario: Tally without a total
- **WHEN** a row has tally marks but no digits in its boxes
- **THEN** the field is flagged "tally but no total", and the tally estimate is offered as a suggested value

#### Scenario: Tally disagrees with total
- **WHEN** a row's tally area shows about 12 strokes and the boxes read 21
- **THEN** the field is flagged "tally and total disagree", with both values shown

#### Scenario: Number written beside the boxes
- **WHEN** a volunteer writes a number on the row but outside the digit boxes
- **THEN** the field is flagged "writing outside boxes"

### Requirement: Handwritten text fields are read and always confirmed
The app SHALL read the handwritten text fields, which are the header's name or group and location, plus each Other row's item name. It SHALL propose a text value for each. Every non-blank text field SHALL require human confirmation, whatever the reading's confidence.

#### Scenario: Other item name
- **WHEN** a volunteer prints "WAGON" in an Other row's name area
- **THEN** the app proposes a text value for it, and marks the field as needing confirmation

### Requirement: Recognition runs on the local machine
All field recognition SHALL run on the staff member's machine. No card image or crop SHALL be sent to any network service.

#### Scenario: Offline recognition
- **WHEN** the machine is disconnected from the network after the app and its models have loaded
- **THEN** cards added afterward are still recognized
