import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FOLDER = resolve(import.meta.dir, "../../../drizzle");
const FILES = readdirSync(FOLDER)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** Runs the migrations whose number is in [from, to], statement by statement as the migrator does. */
function migrate(db: Database, from: number, to: number) {
  for (const file of FILES) {
    const n = Number(file.slice(0, 4));
    if (n < from || n > to) continue;
    for (const statement of readFileSync(join(FOLDER, file), "utf8").split("--> statement-breakpoint")) {
      db.run(statement);
    }
  }
}

const count = (db: Database, table: string) =>
  (db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

/** A database as it stood before vets, holding visits and vaccinations with typed clinics and vets. */
function before() {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db, 0, 9);
  db.run("INSERT INTO users (email, name, created_at) VALUES ('a@example.com', 'a', 1)");
  db.run(`INSERT INTO pets (name, species, sex, reproductive, dob_estimated, chart_color, created_by, created_at, updated_at)
          VALUES ('Miso', 'cat', 'female', 'altered', 0, '#a855f7', 1, 1, 1)`);
  const entry = db.prepare(
    `INSERT INTO entries (pet_id, kind, date, clinic, vet, reason, created_by, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, 1, 1, 1)`,
  );
  entry.run("vet", "2026-01-01", "Northside Animal Hospital", "Dr. Okafor", "Annual");
  entry.run("vet", "2026-02-01", "northside animal hospital", "dr. okafor", "Recheck");
  entry.run("vet", "2026-03-01", "Northside Animal Hospital", null, "Nail trim");
  entry.run("vet", "2026-04-01", null, "Dr. Lee", "Second opinion");
  entry.run("vet", "2026-05-01", "Riverside Vets", "Dr. Lee", "Dental");
  entry.run("home", "2026-06-01", null, null, "Weekly check");
  db.run(
    "INSERT INTO measurements (pet_id, entry_id, kind, date, value, created_by, created_at) VALUES (1, 1, 'weight', '2026-01-01', 4000, 1, 1)",
  );
  db.run(
    "INSERT INTO lab_reports (pet_id, entry_id, date, source, created_by, created_at, updated_at) VALUES (1, 1, '2026-01-01', 'in_house', 1, 1, 1)",
  );
  const dose = db.prepare(
    "INSERT INTO vaccinations (pet_id, vaccine, date_given, lot, clinic, created_by, created_at) VALUES (1, ?, ?, ?, ?, 1, 1)",
  );
  dose.run("Rabies", "2026-01-01", "A1", "Northside Animal Hospital");
  dose.run("FVRCP", "2026-01-01", null, "Paws Mobile Clinic");
  dose.run("FeLV", "2026-01-01", null, null);
  return db;
}

test("typed clinics and vets become vets, one per distinct pair whatever its case", () => {
  const db = before();
  migrate(db, 10, 11);
  const vets = db.query("SELECT name, clinic, phone FROM vets ORDER BY lower(name), clinic").all() as {
    name: string;
    clinic: string | null;
  }[];
  expect(vets.map((v) => [v.name.toLowerCase(), v.clinic?.toLowerCase() ?? null])).toEqual([
    ["dr. lee", null],
    ["dr. lee", "riverside vets"],
    ["dr. okafor", "northside animal hospital"],
    ["northside animal hospital", null],
    ["paws mobile clinic", null],
  ]);
});

test("every visit and vaccination that named a clinic or vet is linked to its vet", () => {
  const db = before();
  migrate(db, 10, 11);
  const label = "lower(vets.name) || coalesce(' · ' || lower(vets.clinic), '')";
  const visits = db
    .query(`SELECT reason, ${label} AS vet FROM entries LEFT JOIN vets ON vets.id = entries.vet_id ORDER BY entries.id`)
    .all();
  expect(visits).toEqual([
    { reason: "Annual", vet: "dr. okafor · northside animal hospital" },
    { reason: "Recheck", vet: "dr. okafor · northside animal hospital" },
    { reason: "Nail trim", vet: "northside animal hospital" },
    { reason: "Second opinion", vet: "dr. lee" },
    { reason: "Dental", vet: "dr. lee · riverside vets" },
    { reason: "Weekly check", vet: null },
  ]);
  const doses = db
    .query(
      `SELECT vaccine, lot, ${label} AS vet FROM vaccinations LEFT JOIN vets ON vets.id = vaccinations.vet_id ORDER BY vaccinations.id`,
    )
    .all();
  expect(doses).toEqual([
    { vaccine: "Rabies", lot: "A1", vet: "northside animal hospital" },
    { vaccine: "FVRCP", lot: null, vet: "paws mobile clinic" },
    { vaccine: "FeLV", lot: null, vet: null },
  ]);
});

test("the text columns are dropped and no row of any table is lost", () => {
  const db = before();
  const tables = ["users", "pets", "entries", "measurements", "lab_reports", "vaccinations"];
  const counts = tables.map((t) => count(db, t));
  migrate(db, 10, 11);
  expect(tables.map((t) => count(db, t))).toEqual(counts);

  const columns = (table: string) =>
    (db.query(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map((c) => c.name);
  expect(columns("entries")).not.toContain("clinic");
  expect(columns("entries")).not.toContain("vet");
  expect(columns("entries")).toContain("vet_id");
  expect(columns("vaccinations")).not.toContain("clinic");

  // Lab reports and pets start unlinked, and keep what they pointed at.
  expect(db.query("SELECT vet_id, entry_id FROM lab_reports").all()).toEqual([{ vet_id: null, entry_id: 1 }]);
  expect(db.query("SELECT vet_id FROM pets").all()).toEqual([{ vet_id: null }]);
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});

test("a database with no typed clinics or vets migrates to no vets", () => {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db, 0, 11);
  expect(count(db, "vets")).toBe(0);
});
