import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from ".";
import { labReports, labResults, pets, users } from "./schema";
import { reparseLabResults } from "./reparse";

/** A pet with one lab report, to hang results on. */
function seedReport(db: ReturnType<typeof openDb>["db"]) {
  const user = db.insert(users).values({ email: "a@example.com", name: "a", createdAt: 1 }).returning().get();
  const pet = db
    .insert(pets)
    .values({
      name: "Miso",
      species: "cat",
      sex: "female",
      reproductive: "altered",
      dobEstimated: false,
      chartColor: "#a855f7",
      createdBy: user.id,
      createdAt: 1,
      updatedAt: 1,
    })
    .returning()
    .get();
  const report = db
    .insert(labReports)
    .values({ petId: pet.id, date: "2026-01-01", source: "other", createdBy: user.id, createdAt: 1, updatedAt: 1 })
    .returning()
    .get();
  return report.id;
}

test("results stored under an older reading rule are read again, once", () => {
  const { db } = openDb(":memory:");
  const reportId = seedReport(db);
  // As older rules stored them: "-1" with no number, "≤0.5" as a strict
  // comparator, "1 035" read as 1035 before inner spaces counted as ambiguous.
  db.insert(labResults)
    .values([
      { reportId, analyteId: 1, valueText: "-1", value: null, comparator: null },
      { reportId, analyteId: 2, valueText: "≤0.5", value: 0.5, comparator: "<" },
      { reportId, analyteId: 3, valueText: "2.6", value: 2.6, comparator: null },
      { reportId, analyteId: 4, valueText: "1 035", value: 1035, comparator: null },
    ])
    .run();

  expect(reparseLabResults(db)).toBe(3);
  expect(
    db
      .select()
      .from(labResults)
      .all()
      .map((r) => [r.valueText, r.value, r.comparator]),
  ).toEqual([
    ["-1", -1, null],
    ["≤0.5", 0.5, "<="],
    ["2.6", 2.6, null],
    ["1 035", null, null],
  ]);
  expect(reparseLabResults(db)).toBe(0);
});

test("opening an existing database re-reads its stored results", async () => {
  const dataDir = join(await mkdtemp(join(tmpdir(), "whiskerfile-reparse-")), "data");
  const first = openDb(dataDir);
  const reportId = seedReport(first.db);
  first.db.insert(labResults).values({ reportId, analyteId: 1, valueText: "-1", value: null, comparator: null }).run();
  first.sqlite.close();

  const again = openDb(dataDir);
  expect(
    again.db
      .select()
      .from(labResults)
      .all()
      .map((r) => [r.valueText, r.value]),
  ).toEqual([["-1", -1]]);
  again.sqlite.close();
});
