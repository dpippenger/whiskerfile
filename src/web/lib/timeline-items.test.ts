import { expect, test } from "bun:test";
import type { PetHealth } from "../../server/routes/health";
import type { LabReportWithResults } from "../../server/routes/labs";
import type { PetRecords } from "../../server/routes/records";
import { medicationDates, timelineItems } from "./timeline-items";

// Only the fields the timeline reads; the rest of each record doesn't matter here.
const records = {
  entries: [{ id: 1, date: "2026-11-06", createdAt: 10 }],
  measurements: [{ id: 2, date: "2026-11-16", createdAt: 11 }],
  attachments: [{ id: 3, date: "2014-06-01", createdAt: 1 }],
} as unknown as PetRecords;
const labs = [{ id: 4, date: "2026-11-06", createdAt: 12 }] as unknown as LabReportWithResults[];
const health = {
  // Placed by the date given, not the due date.
  vaccinations: [{ id: 5, dateGiven: "2025-12-03", dueDate: "2026-12-02", createdAt: 13 }],
  // Placed by the start date, not the end date.
  medications: [{ id: 6, startDate: "2026-11-06", endDate: "2026-12-06", createdAt: 9 }],
  // Placed by the date it began, not when it was resolved.
  conditions: [{ id: 7, date: "2026-04-02", resolvedOn: "2026-11-17", createdAt: 14 }],
} as unknown as PetHealth;

test("every kind of record is placed by its own date, newest day first, newest added first within a day", () => {
  expect(timelineItems(records, labs, health).map((i) => [i.type, i.date])).toEqual([
    ["measurement", "2026-11-16"],
    // Same day: the lab report (added at 12) before the visit (10) before the medication (9).
    ["lab", "2026-11-06"],
    ["entry", "2026-11-06"],
    ["medication", "2026-11-06"],
    ["condition", "2026-04-02"],
    ["vaccination", "2025-12-03"],
    ["file", "2014-06-01"],
  ]);
});

test("a medication's dates are worded for whether each has passed", () => {
  const today = "2026-11-18";
  expect(medicationDates({ startDate: "2026-11-06", endDate: null }, today)).toBe("Started Nov 6, 2026");
  expect(medicationDates({ startDate: "2026-11-06", endDate: "2026-11-16" }, today)).toBe(
    "Started Nov 6, 2026, stopped Nov 16, 2026",
  );
  // A course still running on its last day, and one entered ahead of time.
  expect(medicationDates({ startDate: "2026-11-06", endDate: today }, today)).toBe(
    "Started Nov 6, 2026, until Nov 18, 2026",
  );
  expect(medicationDates({ startDate: "2026-12-01", endDate: "2026-12-10" }, today)).toBe(
    "Starts Dec 1, 2026, until Dec 10, 2026",
  );
  // Once the pet has passed away every course is past: it reads as ended, never ongoing.
  expect(medicationDates({ startDate: "2026-11-06", endDate: "2026-12-06" }, today, "2026-11-10")).toBe(
    "Started Nov 6, 2026, stopped Dec 6, 2026",
  );
  expect(medicationDates({ startDate: "2026-12-01", endDate: null }, today, "2026-11-10")).toBe("Started Dec 1, 2026");
});
