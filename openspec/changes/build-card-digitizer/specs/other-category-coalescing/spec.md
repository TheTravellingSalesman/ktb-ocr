## Purpose

Merges the handwritten "Other" items volunteers write into a shared category list by meaning, not by spelling. "Wagon" and "cart" can end up as one category, and "water bottle" can land on a printed category. The list grows from staff confirmations and can be edited by hand at any time.

## ADDED Requirements

### Requirement: The category list holds categories and aliases
The shared category list SHALL hold categories and aliases.

A category has:
- a stable identifier
- a display name
- whether it's a printed card category
- a status: active, retired, or merged into another category

An alias maps a normalized raw string volunteers wrote to one category. The printed categories of every shipped card definition SHALL be present in the list.

#### Scenario: First use
- **WHEN** the app connects to an empty category store
- **THEN** the store gains one category per printed card category, and no aliases

### Requirement: Exact alias matches resolve automatically
When a confirmed Other item name, once normalized, exactly matches an existing alias, the app SHALL propose that alias's category without asking for a match decision.

#### Scenario: Previously seen name
- **WHEN** "cart" was earlier confirmed as an alias of the "Wagons / carts" category, and a new card's Other row reads "Cart"
- **THEN** the item is proposed as "Wagons / carts", with no match decision required

### Requirement: Other items are matched by intent
When there's no exact alias match, the app SHALL rank existing active categories by how close in meaning the item name is to each category's name and aliases. This includes printed categories. It SHALL act on the result as follows:
- above a high threshold, pre-select the top category
- between the thresholds, offer the top three categories to choose from
- below the low threshold, propose creating a new category named from the item text

Staff SHALL always be able to pick any category or create a new one.

#### Scenario: Synonym of a known category
- **WHEN** a category "Wagons / carts" exists with alias "wagon", and a new Other item reads "cart"
- **THEN** "Wagons / carts" is among the categories offered

#### Scenario: Misread handwriting
- **WHEN** a category "Balloons" exists and an Other item is read as "balon"
- **THEN** "Balloons" is among the categories offered

#### Scenario: Item that matches a printed category
- **WHEN** an Other item reads "water bottle"
- **THEN** the printed "Bottles (plastic)" category is among the categories offered, and is labelled as a printed category

#### Scenario: Genuinely new item
- **WHEN** an Other item reads "kayak paddle" and nothing in the list is close in meaning
- **THEN** the app proposes a new category named "kayak paddle"

### Requirement: Confirmed matches grow the list
When staff confirm an Other item's category, the app SHALL record the item's normalized text as an alias of that category, unless it already is one. When staff create a new category, the app SHALL add it to the list with the item's text as its first alias.

#### Scenario: Confirming a suggestion
- **WHEN** a staff member confirms "cart" as "Wagons / carts"
- **THEN** "cart" becomes an alias of "Wagons / carts" in the shared list, and later cards match it exactly

### Requirement: The list can be triaged by hand
Staff SHALL be able to rename a category, merge one category into another, move an alias to a different category, and retire a category, directly in the store. The app SHALL respect these edits the next time it loads the list. A merged category SHALL keep its identifier and point to the category it was merged into.

#### Scenario: Merging duplicates
- **WHEN** staff mark category "Carts" as merged into "Wagons / carts" in the store
- **THEN** the app no longer offers "Carts", matches its aliases to "Wagons / carts", and resolves the old identifier to "Wagons / carts"

### Requirement: Raw text is always kept
Every exported Other item SHALL carry the volunteer's raw text as confirmed by staff, alongside its category identifier. That way any later triage can be applied again to past data.

#### Scenario: Re-mapping past data
- **WHEN** an alias is moved to a different category after cards using it were exported
- **THEN** the exported raw text allows those past rows to be re-mapped by joining against the updated alias list

### Requirement: Works without the shared store
When no category store is configured, or the store can't be reached, the app SHALL still let staff confirm Other items. Each item's confirmed text SHALL become a provisional new category. Provisional categories SHALL be marked in the export so they can be merged later.

#### Scenario: Store unreachable
- **WHEN** the category store can't be reached and a staff member confirms an Other item reading "wagon"
- **THEN** the item is exported under a provisional category named "wagon" and marked unresolved, with its raw text

### Requirement: The category store is swappable
The app SHALL access the category list only through one store interface. Supporting a different backend SHALL require only a new implementation of that interface. The first backend SHALL be a spreadsheet editable by KTB staff.

#### Scenario: Configuring the store
- **WHEN** an administrator sets the app's category store to a spreadsheet backend with its address
- **THEN** the app reads and writes the category list through that backend, with no other changes
