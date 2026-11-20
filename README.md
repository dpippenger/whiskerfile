# Whiskerfile

Self-hosted medical records for your pets: cats first, dogs and other animals welcome. It runs at home in Docker and is reached through a Cloudflare tunnel, with Cloudflare Access handling sign-in.

Status: in place are the foundation (server, sign-in, scheduled backups), pet profiles (photo, identity, microchip and registry), records (vet visits, home exams, vitals, weigh-ins and attached files, with a timeline, weight history and file gallery), lab reports (entered by hand from the printed report, with ranges, flags and history), trend charts per pet, comparisons across pets, and vaccinations, medications and conditions. The dashboard shows each pet's vaccines due and out-of-range lab results, each pet's health report downloads as a PDF to share with a vet, and lab results can be read from a PDF or photo of the report with Claude.

See [CHANGELOG.md](CHANGELOG.md) for what each phase added. Each feature's requirements, as built, are in [docs/specs/](docs/specs/): [platform](docs/specs/platform-foundation/spec.md), [pet profiles](docs/specs/pet-profiles/spec.md), [visits and files](docs/specs/visits-and-files/spec.md), [lab results](docs/specs/lab-results/spec.md), [trends and compare](docs/specs/trends-and-compare/spec.md), [health records](docs/specs/health-records/spec.md), [PDF reports](docs/specs/pdf-health-reports/spec.md) and [lab document import](docs/specs/lab-document-import/spec.md).

## Run it at home

You need Docker, a domain on Cloudflare, and a Cloudflare Zero Trust team (the free plan is enough).

1. In Zero Trust, create a tunnel and copy its token. Add a public hostname to it (for example `pets.example.com`) with the service `http://app:3000`.
2. Create a self-hosted Access application for that hostname. Add Google as a login method and a policy that allows only your household's email addresses. Copy the application's Audience (AUD) tag.
3. Copy `.env.example` to `.env` and fill in `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` and `TUNNEL_TOKEN`.
4. Create the data and backup folders yourself, so they belong to you and not to root, then start it:

   ```sh
   mkdir -p data backups
   docker compose up -d --build
   ```

   The app runs as user 1000. If `id -u` prints something else, set `APP_UID` and `APP_GID` in `.env`. A custom `BACKUP_PATH` must exist and be writable by that user.

The app container publishes no port on the host, so the tunnel is the only way in. The app also verifies Cloudflare's signed header on every request and rejects anything without it.

## Health reports

**Report** on a pet's page downloads a PDF of the pet's details, weight chart, a trend chart for each test with two or more results, every lab report with its ranges and flags, vaccinations, medications and conditions, for all records or a chosen period. The image includes Chromium, which prints it.

## Backups

The database and uploaded files are copied to the backup folder every night at 03:00 (`BACKUP_CRON`, read in the `TZ` time zone). Set `BACKUP_PATH` to a folder on a different disk or a NAS share. Seven daily, four weekly and twelve monthly snapshots are kept. Settings shows each run and lets you back up on demand or download a snapshot.

To restore: stop the stack, copy a snapshot from `<backup folder>/db/` over `data/whiskerfile.sqlite`, delete `data/whiskerfile.sqlite-wal` and `data/whiskerfile.sqlite-shm` if present, copy `<backup folder>/uploads/` into `data/uploads/`, and start the stack again.

## Reading lab reports with Claude

With `ANTHROPIC_API_KEY` set in `.env`, the lab form gets **Read results from a document**. Pick the lab's PDF or a photo of a printed receipt: the document is attached to the report and sent to Anthropic's API, which reads each result, unit and range as printed and matches them to your list of tests. The form is filled in for you to check; nothing is saved until you save it. Values you have already typed are kept, results that aren't in your list are listed for you to add by hand, and no range is ever filled in that the document doesn't print. It uses Claude Opus 5.5, and each document read is billed to your Anthropic account. Without a key, the button explains what to set.

## Development

```sh
bun install
bun run dev      # http://localhost:3000, signed in as a local user
bun run seed:dev # in a second terminal: adds sample pets, weights, visits, files and lab reports to the dev server
bun test
bun check
```

`bun run dev` sets `AUTH_MODE=dev`, which skips sign-in. Never set that on a server other people can reach.

PDF reports need Chromium: set `CHROMIUM_PATH` (in `.env` or the shell) to a Chromium or headless-shell binary, for example `npx playwright install chromium-headless-shell` and its `headless_shell`. Without it, reports answer 503. With it set, `bun test` also prints one real report.

`bun run read:lab <file>` reads one lab PDF or photo with Claude and prints what the form would be filled with, which is the way to check the reading on real reports. It needs `ANTHROPIC_API_KEY` and is billed; `bun test` never calls the API.

Database schema lives in `src/server/db/schema.ts`. After changing it, run `bun run db:generate` and commit the new migration; migrations apply on startup.

Every pull request runs the CI workflow (`.github/workflows/ci.yml`), and `main` requires its `ci-gate` check. To run the same checks before pushing:

```sh
bun run format:check
bun lint                 # type-aware rules from .oxlintrc.json; needs the canary build (bun upgrade --canary)
bun check
bun test
bun run check:unused     # knip: files, exports and dependencies nothing uses
bun run check:migrations # the migrations match the schema
bun audit --audit-level=high
docker build -t whiskerfile:ci . && .github/scripts/image-smoke.sh whiskerfile:ci
```

The last one boots the production image and checks that the front end is bundled and a report prints. CI installs the Bun named in `.bun-version`, which must match the `Dockerfile`.
