import { expect, test } from "bun:test";
import type { PetHealth } from "../routes/health";
import type { LabReportWithResults } from "../routes/labs";
import { reportModel, type ReportInput, type ReportOptions } from "./model";

const pet = {
  id: 1,
  name: "Miso",
  dob: "2014-03-15",
  dobEstimated: false,
  deceasedOn: null,
  registry: null,
} as unknown as ReportInput["pet"];

const result = (id: number, code: string, valueText: string, unit = "mg/dL", sortOrder = 30) => ({
  id,
  analyteId: sortOrder,
  code,
  name: code,
  sortOrder,
  valueText,
  value: Number.isNaN(Number(valueText)) ? null : Number(valueText),
  comparator: null,
  unit,
  refLow: 0.6,
  refHigh: 2.4,
});
const report = (id: number, date: string, results: ReturnType<typeof result>[]) =>
  ({ id, date, results }) as unknown as LabReportWithResults;

// Newest first, as the API returns them. ALB comes first in the catalog but
// only on the older reports, so the order the tests are met in isn't catalog order.
const labs = [
  report(3, "2026-11-06", [result(31, "CREA", "2.9"), result(32, "GLU", "120", "mg/dL", 10)]),
  report(2, "2026-05-02", [
    result(23, "ALB", "3.1", "g/dL", 5),
    result(21, "CREA", "1.9"),
    result(22, "GLU", "8.1", "mmol/L", 10),
  ]),
  report(1, "2025-10-14", [result(13, "ALB", "3.4", "g/dL", 5), result(11, "CREA", "1.6")]),
];

const health = {
  vaccinations: [
    { id: 3, vaccine: "FVRCP", dateGiven: "2025-10-14", dueDate: "2026-10-14" },
    { id: 2, vaccine: "rabies", dateGiven: "2025-11-03", dueDate: "2028-11-02" },
    { id: 1, vaccine: "Rabies", dateGiven: "2023-11-14", dueDate: "2024-11-14" },
  ],
  medications: [
    { id: 2, drug: "Methimazole", startDate: "2026-11-06", endDate: null },
    { id: 1, drug: "Amoxicillin", startDate: "2026-04-02", endDate: "2026-04-12" },
  ],
  conditions: [
    { id: 2, title: "Dental extraction", date: "2026-04-02", resolvedOn: "2026-04-17" },
    { id: 1, title: "Hyperthyroidism", date: "2024-06-01", resolvedOn: null },
  ],
} as unknown as PetHealth;

const weights = [
  { date: "2025-11-20", value: 4280 },
  { date: "2026-11-16", value: 4000 },
];

const options = (fields: Partial<ReportOptions> = {}): ReportOptions => ({
  today: "2026-11-18",
  from: null,
  to: null,
  weightUnit: "kg",
  ...fields,
});

test("everything is included by default, with statuses as of the reader's date", () => {
  const m = reportModel({ pet, weights, labs, health }, options());
  expect(m.age).toBe("12 yr 8 mo");
  expect(m.weights).toEqual([
    { date: "2025-11-20", value: 4.28 },
    { date: "2026-11-16", value: 4 },
  ]);
  expect(m.reports.map((r) => r.id)).toEqual([3, 2, 1]);
  expect(m.reports[0]!.results.map((r) => [r.code, r.flag])).toEqual([
    ["CREA", "high"],
    ["GLU", "high"],
  ]);
  expect(m.vaccinations.map((v) => [v.id, v.status, v.latest])).toEqual([
    [3, "overdue", true],
    [2, null, true],
    // Superseded by the later rabies dose: never flagged.
    [1, null, false],
  ]);
  expect(m.medications.map((x) => [x.drug, x.state])).toEqual([
    ["Methimazole", "current"],
    ["Amoxicillin", "past"],
  ]);
});

test("a trend is drawn for each test with two or more results in one unit, in catalog order", () => {
  const m = reportModel({ pet, weights, labs, health }, options());
  // GLU has two results, but in different units: only one can be drawn, so no trend.
  expect(m.trends.map((t) => [t.code, t.series.points.map((p) => p.value)])).toEqual([
    ["ALB", [3.4, 3.1]],
    ["CREA", [1.6, 1.9, 2.9]],
  ]);
});

test("a period keeps records dated inside it, and courses and conditions that overlap it", () => {
  const m = reportModel({ pet, weights, labs, health }, options({ from: "2026-01-01", to: "2026-06-30" }));
  expect(m.weights).toEqual([]);
  expect(m.reports.map((r) => r.id)).toEqual([2]);
  // One report in the period: nothing to draw a line through.
  expect(m.trends).toEqual([]);
  expect(m.vaccinations).toEqual([]);
  expect(m.medications.map((x) => x.drug)).toEqual(["Amoxicillin"]);
  // Hyperthyroidism began before the period and is still ongoing.
  expect(m.conditions.map((c) => c.title)).toEqual(["Dental extraction", "Hyperthyroidism"]);

  const since = reportModel({ pet, weights, labs, health }, options({ from: "2026-11-01" }));
  expect(since.conditions.map((c) => c.title)).toEqual(["Hyperthyroidism"]);
  expect(since.medications.map((x) => x.drug)).toEqual(["Methimazole"]);
});

test("a pet that has passed away has its age at death and nothing due or current", () => {
  const m = reportModel(
    { pet: { ...pet, deceasedOn: "2022-01-12" }, weights, labs, health },
    options({ weightUnit: "lb" }),
  );
  expect(m.age).toBe("7 yr 9 mo");
  expect(m.vaccinations.every((v) => v.status === null)).toBe(true);
  expect(m.medications.every((x) => x.state === "past")).toBe(true);
  // In the reader's unit, to two decimals.
  expect(m.weights[1]!.value).toBe(8.82);
});
