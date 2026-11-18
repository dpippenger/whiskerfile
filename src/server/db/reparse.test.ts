import { expect, test } from "bun:test";
import { openDb } from ".";
import { labReports, labResults, pets, users } from "./schema";
import { reparseLabResults } from "./reparse";

test("results stored under an older reading rule are read again, once", () => {
  const { db } = openDb(":memory:");
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
  // As phase 3 stored them: "-1" with no number, "≤0.5" as a strict comparator.
  db.insert(labResults)
    .values([
      { reportId: report.id, analyteId: 1, valueText: "-1", value: null, comparator: null },
      { reportId: report.id, analyteId: 2, valueText: "≤0.5", value: 0.5, comparator: "<" },
      { reportId: report.id, analyteId: 3, valueText: "2.6", value: 2.6, comparator: null },
    ])
    .run();

  expect(reparseLabResults(db)).toBe(2);
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
  ]);
  expect(reparseLabResults(db)).toBe(0);
});
