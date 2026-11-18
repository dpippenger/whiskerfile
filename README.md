# Whiskerfile

Self-hosted medical records for your pets: cats first, dogs and other animals welcome. It runs at home in Docker and is reached through a Cloudflare tunnel, with Cloudflare Access handling sign-in.

Status: the foundation is in place (server, sign-in, app shell, scheduled backups). Pet profiles, records, lab results, trends and PDF reports are being added in phases.

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

## Backups

The database and uploaded files are copied to the backup folder every night at 03:00 (`BACKUP_CRON`, read in the `TZ` time zone). Set `BACKUP_PATH` to a folder on a different disk or a NAS share. Seven daily, four weekly and twelve monthly snapshots are kept. Settings shows each run and lets you back up on demand or download a snapshot.

To restore: stop the stack, copy a snapshot from `<backup folder>/db/` over `data/whiskerfile.sqlite`, delete `data/whiskerfile.sqlite-wal` and `data/whiskerfile.sqlite-shm` if present, copy `<backup folder>/uploads/` into `data/uploads/`, and start the stack again.

## Development

```sh
bun install
bun run dev      # http://localhost:3000, signed in as a local user
bun test
bun check
```

`bun run dev` sets `AUTH_MODE=dev`, which skips sign-in. Never set that on a server other people can reach.

Database schema lives in `src/server/db/schema.ts`. After changing it, run `bun run db:generate` and commit the new migration; migrations apply on startup.
