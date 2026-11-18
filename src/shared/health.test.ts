import { expect, test } from "bun:test";
import { addDays } from "./dates";
import {
  conditionInput,
  isActiveCondition,
  isCurrentMedication,
  medicationInput,
  vaccinationInput,
  vaccineKey,
  vaccineStatus,
} from "./health";

const today = "2026-11-18";
const dose = (id: number, vaccine: string, dateGiven: string, dueDate: string | null) => ({
  id,
  vaccine,
  dateGiven,
  dueDate,
});

test("dates move by calendar days across months and years", () => {
  expect(addDays("2026-11-18", 30)).toBe("2026-12-18");
  expect(addDays("2026-12-20", 15)).toBe("2027-01-04");
  expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
});

test("vaccine names match across doses whatever the case or spacing", () => {
  expect(vaccineKey("FVRCP")).toBe(vaccineKey("fvr-cp"));
  expect(vaccineKey("Canine Influenza")).toBe(vaccineKey("canine influenza "));
});

test("only each vaccine's latest dose can be due, overdue or fine", () => {
  const statuses = vaccineStatus(
    [
      // An old rabies dose long overdue, superseded by a newer one: no alert.
      dose(1, "Rabies", "2023-01-10", "2024-01-10"),
      dose(2, "rabies", "2025-12-01", "2028-12-01"),
      dose(3, "FVRCP", "2025-11-01", "2026-11-01"),
      dose(4, "FeLV", "2025-12-15", addDays(today, 20)),
      dose(5, "Bordetella", "2026-06-01", null),
    ],
    today,
  );
  expect(statuses.map((s) => [s.dose.id, s.status])).toEqual([
    [5, null],
    [4, "due-soon"],
    [3, "overdue"],
    [2, null],
  ]);
});

test("the same day's doses are ordered by entry; the boundaries are inclusive", () => {
  const [only] = vaccineStatus(
    [dose(7, "FVRCP", "2026-01-01", today), dose(6, "FVRCP", "2026-01-01", "2020-01-01")],
    today,
  );
  expect(only).toMatchObject({ dose: { id: 7 }, status: "due-soon" });
  expect(vaccineStatus([dose(1, "x", "2026-01-01", addDays(today, 30))], today)[0]!.status).toBe("due-soon");
  expect(vaccineStatus([dose(1, "x", "2026-01-01", addDays(today, 31))], today)[0]!.status).toBeNull();
});

test("a pet that has died has nothing due and no current medications", () => {
  expect(vaccineStatus([dose(1, "Rabies", "2020-01-01", "2021-01-01")], today, "2022-01-12")[0]!.status).toBeNull();
  expect(isCurrentMedication({ startDate: "2021-06-01", endDate: null }, today, "2022-01-12")).toBe(false);
});

test("medications are current between their start and end dates", () => {
  expect(isCurrentMedication({ startDate: "2026-11-06", endDate: null }, today)).toBe(true);
  expect(isCurrentMedication({ startDate: "2026-11-06", endDate: today }, today)).toBe(true);
  expect(isCurrentMedication({ startDate: "2026-11-06", endDate: "2026-11-17" }, today)).toBe(false);
  expect(isCurrentMedication({ startDate: "2026-11-19", endDate: null }, today)).toBe(false);
});

test("conditions stay active until their resolved date", () => {
  expect(isActiveCondition({ resolvedOn: null }, today)).toBe(true);
  expect(isActiveCondition({ resolvedOn: today }, today)).toBe(false);
});

test("inputs reject end dates before their start", () => {
  const paths = (
    schema: { safeParse: (x: unknown) => { error?: { issues: { path: PropertyKey[] }[] } } },
    input: object,
  ) => schema.safeParse(input).error?.issues.map((i) => i.path.join("."));
  expect(
    paths(vaccinationInput, {
      vaccine: "Rabies",
      dateGiven: "2026-01-01",
      dueDate: "2025-01-01",
      lot: "",
      clinic: "",
      notes: "",
    }),
  ).toEqual(["dueDate"]);
  expect(
    paths(medicationInput, {
      drug: "Methimazole",
      dose: "2.5 mg",
      frequency: "Twice daily",
      startDate: "2026-11-06",
      endDate: "2026-11-01",
      reason: "",
      notes: "",
    }),
  ).toEqual(["endDate"]);
  expect(
    paths(conditionInput, { kind: "diagnosis", title: " ", date: "2026-01-01", resolvedOn: "", notes: "" }),
  ).toEqual(["title"]);
});
