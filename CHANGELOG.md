# Changelog

## Unreleased

### Added

- Vets: save each vet once with their clinic, phone, email, address, website and notes, on the new **Vets** screen. Visits, lab reports and vaccinations link to a saved vet, picked in their forms (with **New vet** to add one on the spot), and each pet can have a usual vet. A vet's page shows their contact details, with phone and email as links, and every linked record across pets. The clinic and vet typed on earlier visits and vaccinations are turned into vets and linked automatically; deleting a vet keeps its records and only clears the link.
- Lab form: **Read results from a document** sends the lab's PDF or a photo of the report to Claude, attaches it to the report, and fills in each result, unit and range as printed for you to check before saving. Typed values are never replaced, unmatched results are listed, and ranges come only from the document. Needs `ANTHROPIC_API_KEY`.

### Fixed

- Pets: an address that isn't a pet number shows "Pet not found" instead of a blank page; a pet under a week old shows its age in days; the pet list sorts names without regard to case; a chip registry saved without a chip number shows on the Details card; deleting a registry that pets still use shows the "in use" message even after earlier form errors.
- Files: uploading a file again under a new name, or by another household member, keeps that name and uploader. The API no longer deletes a visit's files or a lab report's documents through the standalone-file route, and refuses a preview for an image small enough to be its own.
- Records: standalone readings are weights only, and a reading's kind is fixed once recorded. Switching a visit to a home exam warns that the clinic and vet will be removed, and the dialog title follows the kind chosen.
- Labs: a value with a space inside the number, such as `1 035`, is kept as printed instead of being read as 1035 (stored values are re-read at startup). A lab report can no longer link a home exam as its visit or attach another pet's file. Deleting a test from the catalog asks for a confirming second click.
- Health: a pet that has passed away no longer shows "Next due" dates, and its medication courses read as ended on the timeline; vaccines and medications now follow one rule for a date of passing.
- Trends: the shaded reference range covers every result, including the latest, and a single result shows its range (also in PDF reports). Compare says how many of a pet's results were not drawn and why.
- Reports: one failed font read no longer breaks every later PDF until restart; a failure before printing returns the usual error and is logged; closing the dialog while the PDF is being prepared cancels the download; the dialog shows the server's message when no field on screen is at fault.
- Lab document import: a result whose printed range is too long for the form is listed as not filled in; a document that can't be read no longer stays attached, and the picker offers only PDFs and images; a PDF without a `.pdf` name is read as a PDF; the notice counts only the results it filled in; PNG and GIF documents small enough for the API are sent unmodified.
- API: dates in the future (later than tomorrow in UTC, to allow for the browser's time zone) are refused for visits, weights, files, lab reports, a pet's birth and passing dates, vaccinations and conditions, as the forms already did.
- Backups: a backup that fails after its database snapshot is written records the snapshot with the failed run, so it stays listed and downloadable.
- The server finds its migrations wherever it is started from.
- README: Cloudflare's signed header is checked on every `/api` request, not every request.

### Development

- Pull requests are gated by CI: formatting, lint (`bun lint`), type check, tests, unused code (knip), migration drift, commit messages, a dependency audit, and a smoke test of the built image, which prints a real report. `make check` and `make ci` run the same checks locally, and git hooks format and lint staged files, check commit messages (commitlint) and run `make check` before a push. Dependabot proposes dependency updates weekly.
- Tests: the lab form's document reading (attach, fill, notice, failures) runs in a DOM (happy-dom) against the in-process API; `scripts/read-lab.ts`, the image scaling, the API client and upload previews, the rest of the PDF report page and several refusal paths are now covered too.

## Phase 6: PDF health reports (2026-11-18)

### Added

- Health report: **Report** on a pet's page downloads a PDF (details, weight chart, lab trend charts, every lab report with ranges and flags, vaccinations, medications and conditions), for all records or a chosen period. It is built on the server and printed by Chromium, which the image now includes; set `CHROMIUM_PATH` to use it outside Docker.
- The image runs under `tini`, so the processes Chromium leaves behind are reaped.

## Phase 5: vaccinations, medications and conditions (2026-11-18)

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
