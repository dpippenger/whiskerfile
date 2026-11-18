import { expect, test } from "bun:test";
import { petAlerts } from "./alerts";

const TODAY = "2026-11-18";
const dose = (id: number, vaccine: string, dateGiven: string, dueDate: string | null) => ({
  id,
  vaccine,
  dateGiven,
  dueDate,
});
const latestLab = {
  id: 7,
  date: "2026-11-06",
  flagged: [{ code: "CREA", name: "Creatinine", valueText: "2.9", unit: "mg/dL", flag: "high" as const }],
};

test("overdue vaccines come before those due soon, and superseded or distant doses stay quiet", () => {
  const { due, lab } = petAlerts(
    {
      deceasedOn: null,
      vaccinations: [
        dose(1, "FeLV", "2025-12-01", "2026-12-01"), // due soon
        dose(2, "rabies", "2025-11-01", "2028-11-01"), // not due for years
        dose(3, "Rabies", "2023-11-01", "2024-11-01"), // superseded by the dose above
        dose(4, "FVRCP", "2025-10-14", "2026-10-14"), // overdue
      ],
      latestLab,
    },
    TODAY,
  );
  expect(due.map((d) => [d.dose.id, d.status])).toEqual([
    [4, "overdue"],
    [1, "due-soon"],
  ]);
  expect(lab).toBe(latestLab);
});

test("a latest report with nothing out of range raises no lab alert", () => {
  expect(petAlerts({ deceasedOn: null, vaccinations: [], latestLab: { ...latestLab, flagged: [] } }, TODAY)).toEqual({
    due: [],
    lab: null,
  });
  expect(petAlerts({ deceasedOn: null, vaccinations: [], latestLab: null }, TODAY).lab).toBeNull();
});

test("a pet that has passed away raises no alerts", () => {
  expect(
    petAlerts(
      { deceasedOn: "2026-01-12", vaccinations: [dose(1, "FVRCP", "2020-06-01", "2021-06-01")], latestLab },
      TODAY,
    ),
  ).toEqual({ due: [], lab: null });
});
