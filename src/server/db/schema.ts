import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { CHART_COLORS, REPRODUCTIVE, SEXES, SPECIES } from "../../shared/pets";

// Timestamps are epoch milliseconds so rows serialise to JSON unchanged.
// Calendar dates are "YYYY-MM-DD" text (see src/shared/dates.ts).

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

export const chipRegistries = sqliteTable("chip_registries", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  website: text(),
  phone: text(),
});

/** Uploaded files, stored on disk as uploads/<sha256> and never modified. */
export const files = sqliteTable("files", {
  id: integer().primaryKey({ autoIncrement: true }),
  sha256: text().notNull().unique(),
  // Detected from the file's contents, never taken from the client.
  mime: text().notNull(),
  sizeBytes: integer().notNull(),
  originalName: text().notNull(),
  uploadedBy: integer()
    .notNull()
    .references(() => users.id),
  createdAt: integer().notNull(),
});

export const pets = sqliteTable("pets", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  species: text({ enum: SPECIES }).notNull(),
  breed: text(),
  sex: text({ enum: SEXES }).notNull(),
  reproductive: text({ enum: REPRODUCTIVE }).notNull(),
  dob: text(),
  dobEstimated: integer({ mode: "boolean" }).notNull(),
  coatColor: text(),
  eyeColor: text(),
  chartColor: text({ enum: CHART_COLORS }).notNull(),
  microchip: text(),
  chipRegistryId: integer().references(() => chipRegistries.id),
  photoFileId: integer().references(() => files.id),
  notes: text(),
  deceasedOn: text(),
  createdBy: integer()
    .notNull()
    .references(() => users.id),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});

export type User = typeof users.$inferSelect;
export type ChipRegistry = typeof chipRegistries.$inferSelect;
export type StoredFile = typeof files.$inferSelect;
export type Pet = typeof pets.$inferSelect;
export type BackupRun = typeof backupRuns.$inferSelect;
