import { index, integer, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { ANALYTE_CATEGORIES, LAB_SOURCES } from "../../shared/labs";
import { CHART_COLORS, REPRODUCTIVE, SEXES, SPECIES } from "../../shared/pets";
import { ENTRY_KINDS, TEMPERATURE_UNITS, VITALS, WEIGHT_UNITS } from "../../shared/records";

// Timestamps are epoch milliseconds so rows serialise to JSON unchanged.
// Calendar dates are "YYYY-MM-DD" text (see src/shared/dates.ts).

export const users = sqliteTable("users", {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
  name: text().notNull(),
  // Null means "follow the browser's locale".
  weightUnit: text({ enum: WEIGHT_UNITS }),
  temperatureUnit: text({ enum: TEMPERATURE_UNITS }),
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
  // A small image shown in its place in lists, so they don't load the original.
  previewId: integer().references((): AnySQLiteColumn => files.id),
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

/** A vet visit or a home exam. Deleting the pet deletes these, and their vitals. */
export const entries = sqliteTable(
  "entries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    petId: integer()
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    kind: text({ enum: ENTRY_KINDS }).notNull(),
    date: text().notNull(),
    clinic: text(),
    vet: text(),
    reason: text(),
    notes: text(),
    createdBy: integer()
      .notNull()
      .references(() => users.id),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [index("entries_pet_date").on(t.petId, t.date)],
);

/**
 * One reading in its stored unit (grams, °C, per minute, 1-9 score). Readings
 * taken at a visit carry its entryId and always share its date.
 */
export const measurements = sqliteTable(
  "measurements",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    petId: integer()
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    entryId: integer().references(() => entries.id, { onDelete: "cascade" }),
    kind: text({ enum: VITALS }).notNull(),
    date: text().notNull(),
    value: real().notNull(),
    createdBy: integer()
      .notNull()
      .references(() => users.id),
    createdAt: integer().notNull(),
  },
  (t) => [index("measurements_pet_kind_date").on(t.petId, t.kind, t.date), index("measurements_entry").on(t.entryId)],
);

/** A test that can appear on a lab report, such as creatinine or a white cell count. */
export const analytes = sqliteTable("analytes", {
  id: integer().primaryKey({ autoIncrement: true }),
  code: text().notNull().unique(),
  name: text().notNull(),
  category: text({ enum: ANALYTE_CATEGORIES }).notNull(),
  // Pre-filled for a new result; each result keeps the unit printed on its report.
  defaultUnit: text(),
  sortOrder: integer().notNull(),
});

/** One set of lab results from a single sample. Deleting its visit only unlinks it. */
export const labReports = sqliteTable(
  "lab_reports",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    petId: integer()
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    entryId: integer().references(() => entries.id, { onDelete: "set null" }),
    date: text().notNull(),
    source: text({ enum: LAB_SOURCES }).notNull(),
    lab: text(),
    accession: text(),
    notes: text(),
    createdBy: integer()
      .notNull()
      .references(() => users.id),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [index("lab_reports_pet_date").on(t.petId, t.date)],
);

/**
 * A result exactly as printed (`valueText`), with the number and comparator
 * read from it, and the reference range printed beside it on the report.
 */
export const labResults = sqliteTable(
  "lab_results",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    reportId: integer()
      .notNull()
      .references(() => labReports.id, { onDelete: "cascade" }),
    analyteId: integer()
      .notNull()
      .references(() => analytes.id),
    valueText: text().notNull(),
    value: real(),
    comparator: text({ enum: ["<", ">"] }),
    unit: text(),
    refLow: real(),
    refHigh: real(),
  },
  (t) => [
    uniqueIndex("lab_results_report_analyte").on(t.reportId, t.analyteId),
    index("lab_results_analyte").on(t.analyteId),
  ],
);

/**
 * A stored file filed under a pet: on a visit (sharing its date), on a lab
 * report (its original document), or on its own. Removing an attachment
 * leaves the stored file in place.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    petId: integer()
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    entryId: integer().references(() => entries.id, { onDelete: "cascade" }),
    labReportId: integer().references(() => labReports.id, { onDelete: "cascade" }),
    fileId: integer()
      .notNull()
      .references(() => files.id),
    label: text(),
    date: text().notNull(),
    createdBy: integer()
      .notNull()
      .references(() => users.id),
    createdAt: integer().notNull(),
  },
  (t) => [
    index("attachments_pet_date").on(t.petId, t.date),
    index("attachments_entry").on(t.entryId),
    index("attachments_lab_report").on(t.labReportId),
  ],
);

export type User = typeof users.$inferSelect;
export type ChipRegistry = typeof chipRegistries.$inferSelect;
export type StoredFile = typeof files.$inferSelect;
export type Pet = typeof pets.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Analyte = typeof analytes.$inferSelect;
export type LabReport = typeof labReports.$inferSelect;
export type LabResult = typeof labResults.$inferSelect;
export type BackupRun = typeof backupRuns.$inferSelect;
