import { Database } from "bun:sqlite";
import { eq, inArray } from "drizzle-orm";
import { copyFile, mkdir, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./db";
import { backupRuns, type BackupRun } from "./db/schema";

// Millisecond precision keeps two runs in the same second from colliding.
const SNAPSHOT_RE = /^whiskerfile-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.sqlite$/;
// Files are written under this suffix and renamed once complete, so a file with
// a final name is always whole.
const PARTIAL = ".partial";

export function snapshotName(at: Date): string {
  return `whiskerfile-${at.toISOString().replace(/[-:.]/g, "")}.sqlite`;
}

export function snapshotTime(name: string): Date | null {
  const m = SNAPSHOT_RE.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi, s, ms] = m.slice(1).map(Number) as [number, number, number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
}

const DAY_MS = 86_400_000;
const RETENTION: { count: number; bucket: (t: Date) => number }[] = [
  { count: 7, bucket: (t) => Math.floor(t.getTime() / DAY_MS) },
  // Epoch day 0 was a Thursday; +3 makes buckets run Monday to Sunday.
  { count: 4, bucket: (t) => Math.floor((Math.floor(t.getTime() / DAY_MS) + 3) / 7) },
  { count: 12, bucket: (t) => t.getUTCFullYear() * 12 + t.getUTCMonth() },
];

/**
 * Picks the snapshots to keep: the newest from each of the last 7 days, 4 weeks
 * and 12 months that have one. Everything else may be deleted.
 */
export function snapshotsToKeep(names: string[]): Set<string> {
  const dated = names
    .map((name) => ({ name, at: snapshotTime(name) }))
    .filter((s): s is { name: string; at: Date } => s.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const keep = new Set<string>();
  for (const { count, bucket } of RETENTION) {
    const seen = new Set<number>();
    for (const s of dated) {
      const key = bucket(s.at);
      if (seen.has(key)) continue;
      if (seen.size === count) break;
      seen.add(key);
      keep.add(s.name);
    }
  }
  return keep;
}

/** Lists a directory, creating it if missing and clearing files a cut-off run left half-written. */
async function listDir(dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const names = await readdir(dir);
  for (const name of names) if (name.endsWith(PARTIAL)) await rm(join(dir, name));
  return names.filter((name) => !name.endsWith(PARTIAL));
}

export type BackupContext = { sqlite: Database; db: Db; dataDir: string; backupDir: string };

let running: Promise<BackupRun> | null = null;

/** Runs one backup; a call made while another is in flight joins that run. */
export function runBackup(ctx: BackupContext, now = new Date()): Promise<BackupRun> {
  running ??= backup(ctx, now).finally(() => {
    running = null;
  });
  return running;
}

async function backup({ sqlite, db, dataDir, backupDir }: BackupContext, now: Date): Promise<BackupRun> {
  const file = snapshotName(now);
  const run = db.insert(backupRuns).values({ startedAt: now.getTime(), status: "running" }).returning().get();
  const finish = (values: Partial<BackupRun>) =>
    db
      .update(backupRuns)
      .set({ finishedAt: Date.now(), ...values })
      .where(eq(backupRuns.id, run.id))
      .returning()
      .get();

  const dbDir = join(backupDir, "db");
  const target = join(dbDir, file);
  const partial = target + PARTIAL;
  try {
    const existing = await listDir(dbDir);
    sqlite.query("VACUUM INTO ?").run(partial);

    const copy = new Database(partial, { readonly: true });
    try {
      const check = copy.query("PRAGMA integrity_check").get() as { integrity_check: string };
      if (check.integrity_check !== "ok") throw new Error(`Snapshot failed integrity check: ${check.integrity_check}`);
    } finally {
      copy.close();
    }
    await rename(partial, target);

    // Uploads are named by content hash and never change, so copying the ones
    // the backup lacks is a complete incremental backup.
    const uploadsDir = join(dataDir, "uploads");
    const uploadsBackup = join(backupDir, "uploads");
    const have = new Set(await listDir(uploadsBackup));
    for (const name of await listDir(uploadsDir)) {
      if (have.has(name)) continue;
      const dest = join(uploadsBackup, name);
      await copyFile(join(uploadsDir, name), dest + PARTIAL);
      await rename(dest + PARTIAL, dest);
    }

    const all = [...existing, file];
    const keep = snapshotsToKeep(all);
    const pruned = all.filter((name) => snapshotTime(name) && !keep.has(name));
    for (const name of pruned) await unlink(join(dbDir, name));
    if (pruned.length) db.update(backupRuns).set({ file: null }).where(inArray(backupRuns.file, pruned)).run();

    return finish({ status: "ok", file, sizeBytes: (await stat(target)).size });
  } catch (err) {
    await rm(partial, { force: true }).catch(() => {});
    return finish({ status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}

/** A run still marked running at startup was cut off by a restart. */
export function failInterruptedRuns(db: Db) {
  db.update(backupRuns)
    .set({ status: "failed", error: "Interrupted by a restart", finishedAt: Date.now() })
    .where(eq(backupRuns.status, "running"))
    .run();
}
