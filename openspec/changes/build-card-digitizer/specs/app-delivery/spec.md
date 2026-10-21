## Purpose

Defines how the app reaches KTB and keeps running. It runs on a typical staff computer with no install and no paid services, keeps card images private, and can be patched remotely.

## ADDED Requirements

### Requirement: The app runs in a browser with nothing to install
The app SHALL run in a current version of Chrome, Edge, Firefox, or Safari on a typical laptop or desktop. It SHALL NOT require installing software, creating accounts, or paying for services, apart from an optional category store account.

#### Scenario: First use by staff
- **WHEN** a staff member opens the app's URL in a supported browser on a typical laptop
- **THEN** they can add, review, and export cards without installing anything

### Requirement: Card images never leave the machine
The app SHALL NOT send card images, crops, or field values to any network service. The only network traffic SHALL be loading the app and its models, and reading and writing the category list.

#### Scenario: Inspecting network traffic
- **WHEN** a batch of cards is added, reviewed, and exported while network traffic is recorded
- **THEN** no request contains image data or field values, and the only requests after loading are to the configured category store

### Requirement: The app works offline after first load
After the app and its models have loaded once, the app SHALL work without a network connection. The exception is the shared category store, which falls back as defined by other-category-coalescing.

#### Scenario: Processing at a cleanup site
- **WHEN** the app has been opened once, and later is opened with no network connection
- **THEN** it loads and can add, review, and export cards

### Requirement: Updates ship by redeploying
A new app version SHALL reach staff by publishing it to the hosting site, with no action needed from staff beyond reloading. The app SHALL show its version. It SHALL tell staff when a newer version is available.

#### Scenario: Shipping a fix
- **WHEN** a new version is published to the hosting site
- **THEN** a staff member who opens or reloads the app gets the new version, or is told it's available and offered a reload

### Requirement: Updates do not lose work in progress
Updating the app SHALL NOT discard a batch's saved review state.

#### Scenario: Update mid-batch
- **WHEN** a new version is loaded while a batch is half reviewed
- **THEN** the batch and its review state are still there after the update
