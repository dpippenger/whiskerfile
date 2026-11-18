import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBackup, snapshotName, snapshotsToKeep, snapshotTime } from "./backup";
import { openDb } from "./db";
import { backupRuns, users } from "./db/schema";

const at = (iso: string) => snapshotName(new Date(iso));

test("snapshot names round-trip their timestamp", () => {
  const when = new Date("2026-11-18T03:00:07Z");
  expect(snapshotName(when)).toBe("whiskerfile-20261118T030007Z.sqlite");
  expect(snapshotTime(snapshotName(when))).toEqual(when);
  expect(snapshotTime("notes.txt")).toBeNull();
});

test("retention keeps 7 daily, 4 weekly and 12 monthly snapshots", () => {
  // One snapshot a day for 400 days, ending Wednesday 2026-11-18.
  const end = Date.parse("2026-11-18T03:00:00Z");
  const names = Array.from({ length: 400 }, (_, i) => snapshotName(new Date(end - i * 86_400_000)));
  const keep = snapshotsToKeep(names);

  for (let i = 0; i < 7; i++) expect(keep.has(names[i]!)).toBe(true);
  // Newest snapshot of each earlier week is its Sunday.
  for (const day of ["2026-11-15", "2026-11-08", "2026-11-01"]) expect(keep.has(at(`${day}T03:00:00Z`))).toBe(true);
  // Newest snapshot of each earlier month is its last day; 12 months reach back to December 2025.
  expect(keep.has(at("2026-10-31T03:00:00Z"))).toBe(true);
  expect(keep.has(at("2025-12-31T03:00:00Z"))).toBe(true);
  expect(keep.has(at("2025-11-30T03:00:00Z"))).toBe(false);
  // 7 daily, 2 more weekly (the 15th is already a daily) and 11 more monthly.
  expect(keep.size).toBe(7 + 2 + 11);
});

test("retention keeps only the newest snapshot of a day and ignores foreign files", () => {
  const names = [at("2026-11-18T03:00:00Z"), at("2026-11-18T15:00:00Z"), "README.txt"];
  expect([...snapshotsToKeep(names)]).toEqual([at("2026-11-18T15:00:00Z")]);
});

test("a backup snapshots the database, copies new uploads and prunes old snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "whiskerfile-backup-"));
  const dataDir = join(root, "data");
  const backupDir = join(root, "backups");
  const { sqlite, db } = openDb(dataDir);
  db.insert(users).values({ email: "a@example.com", name: "a", createdAt: 1 }).run();
  await mkdir(join(dataDir, "uploads"));
  await writeFile(join(dataDir, "uploads", "abc123"), "photo");
  const ctx = { sqlite, db, dataDir, backupDir };

  const earlier = await runBackup(ctx, new Date("2026-11-18T03:00:00Z"));
  expect(earlier.status).toBe("ok");
  const later = await runBackup(ctx, new Date("2026-11-18T15:00:00Z"));
  expect(later).toMatchObject({ status: "ok", error: null, file: "whiskerfile-20261118T150000Z.sqlite" });
  expect(later.sizeBytes).toBeGreaterThan(0);

  expect(await readdir(join(backupDir, "db"))).toEqual([later.file!]);
  expect(await readdir(join(backupDir, "uploads"))).toEqual(["abc123"]);
  expect(db.select().from(backupRuns).all().map((r) => r.file)).toEqual([null, later.file]);

  const snapshot = new Database(join(backupDir, "db", later.file!), { readonly: true });
  expect(snapshot.query("SELECT email FROM users").all()).toEqual([{ email: "a@example.com" }]);
});

test("a failed backup is recorded with its error", async () => {
  const root = await mkdtemp(join(tmpdir(), "whiskerfile-backup-"));
  const { sqlite, db } = openDb(join(root, "data"));
  await writeFile(join(root, "blocked"), "");
  const run = await runBackup({ sqlite, db, dataDir: join(root, "data"), backupDir: join(root, "blocked") });
  expect(run.status).toBe("failed");
  expect(run.error).toBeTruthy();
});
