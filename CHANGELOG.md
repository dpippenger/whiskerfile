# Changelog

## Unreleased

### Added

- Health tab: vaccinations (each vaccine's latest dose, flagged overdue or due within 30 days, with earlier doses beneath), current medications, conditions (diagnoses, allergies, surgery, dental) and a history of past medications and resolved conditions. Due dates come from the certificate or reminder; the app never works out a schedule. Nothing is flagged for a pet that has passed away.
- Add record offers vaccinations, medications and conditions.
- Dashboard: each living pet's card lists vaccines overdue or due within 30 days, and the results outside their printed range on its latest lab report.
- Timeline: lab reports, vaccine doses, the start of each medication and each condition appear alongside visits, weights and files, and can be opened or edited from there.

### Fixed

- Lab results printed as negative numbers (such as a base excess of -1, including with a typographic minus sign) are read as numbers, so they are flagged and charted. Results saved earlier are re-read when the app starts.

## Phase 4: trends and comparisons (2026-11-18)

### Added

- Compare: one metric (weight or a test) for several pets on one chart, by date or by age, each pet in its own colour. Only results in one unit are plotted, and pets left out (another unit, no results, or no birth date when comparing by age) are named.
- Trends tab: a chart per chosen metric (weight, and each test with numeric results) on a real time axis, over the reference range printed on each report, with flagged points coloured and limit results (such as <0.5) drawn hollow. Results in another unit, or without a number, are counted and named rather than drawn.
- The weight tab's trend line is now a chart with dates on its axis and a zoom slider for long histories.

## Phase 3: lab results (2026-11-18)

### Added

- Lab reports: results kept exactly as printed (including "<0.5" and qualitative results), with the reference range from each report, High/Low flags, a range bar, and the previous result with its change. Reports link to a visit and carry their original documents.
- Lab entry: a keyboard-friendly grid (Enter moves down a column) that copies the tests from the last report, adds a whole category or single tests, pre-fills each unit and range from the pet's last result for that test, previews High/Low as you type, and attaches the original report.
- The test catalog can be edited in Settings; a test with results can't be removed.
- A catalog of 62 common tests (chemistry, electrolytes, CBC, endocrine, urinalysis and others), with codes and units but no built-in reference ranges.
- Web app manifest and icons: install Whiskerfile to an Android home screen or as a desktop app.

### Fixed

- Dashboard cards keep a usable width beside the sidebar on tablets.

## Phase 2: pets and records (2026-11-18)

### Added

- Pet profiles: photo (shrunk in the browser, location data removed), species, breed, sex, spay/neuter status, birth date with computed age, date of passing, coat and eye colour, notes, and a fixed chart colour.
- Microchip number and registry, with a link to AAHA's universal chip lookup. Registries are editable in Settings.
- Vet visits and home exams with vitals (weight, temperature, heart and breathing rate, body condition), plus standalone weigh-ins; every record names its author.
- Per-person display units (lb/kg, °F/°C); readings are stored in grams and °C.
- Timeline, weight tab with trend line and history, and dashboard cards with latest weight and last vet visit.
- File attachments on visits or filed on their own, stored as original bytes, with small previews for large images and a Files tab.

## Phase 1: foundation (2026-11-18)

### Added

- Bun server with SQLite storage and migrations at startup.
- Sign-in through Cloudflare Access; every API request is verified.
- Scheduled backups with 7 daily, 4 weekly and 12 monthly snapshots, plus on-demand backup and download in Settings.
- Docker image and compose stack with a Cloudflare tunnel and no published port.
