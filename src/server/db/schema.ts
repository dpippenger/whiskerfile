import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Timestamps are epoch milliseconds so rows serialise to JSON unchanged.

export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  name: text().notNull(),
  createdAt: integer().notNull(),
});

export const backupRuns = sqliteTable("backup_runs", {
  id: integer().primaryKey({ autoIncrement: true }),
  startedAt: integer().notNull(),
  finishedAt: integer(),
  status: text({ enum: ["running", "ok", "failed"] }).notNull(),
  // Snapshot file name inside the backup directory; null once pruned.
  file: text(),
  sizeBytes: integer(),
  error: text(),
});

export type User = typeof users.$inferSelect;
export type BackupRun = typeof backupRuns.$inferSelect;
