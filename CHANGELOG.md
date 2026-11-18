# Changelog

## Unreleased

### Added

- Lab reports: results kept exactly as printed (including "<0.5" and qualitative results), with the reference range from each report, High/Low flags, a range bar, and the previous result with its change. Reports link to a visit and carry their original documents.
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
