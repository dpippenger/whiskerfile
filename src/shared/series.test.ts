import { expect, test } from "bun:test";
import { parseLabValue } from "./labs";
import { ageInYears, compareSeries, dateToUtc, labSeries, rangeBand, type LabResultInput } from "./series";

const result = (
  date: string,
  valueText: string,
  unit: string | null = "mg/dL",
  refLow: number | null = 0.6,
  refHigh: number | null = 2.4,
  order = 1,
): LabResultInput => ({ date, order, valueText, ...parseLabValue(valueText), unit, refLow, refHigh });

test("calendar dates become midnight UTC, whatever the local time zone", () => {
  expect(dateToUtc("2026-11-06")).toBe(Date.UTC(2026, 10, 6));
  expect(new Date(dateToUtc("2026-01-01")).toISOString()).toBe("2026-01-01T00:00:00.000Z");
});

test("ages are years with fractions from the birth date", () => {
  expect(ageInYears("2014-03-15", "2024-03-15")).toBe(10);
  expect(ageInYears("2014-03-15", "2024-09-15")).toBe(10.5);
  expect(ageInYears("2026-01-01", "2025-12-31")).toBeNull();
});

test("only the latest unit is plotted, and what is left out is counted", () => {
  const series = labSeries([
    result("2025-01-10", "150", "µmol/L", 71, 212),
    result("2025-06-01", "Negative", null, null, null),
    result("2026-05-02", "1.9"),
    result("2026-11-06", "2.6"),
  ]);
  expect(series.unit).toBe("mg/dL");
  expect(series.points.map((p) => [p.date, p.value, p.flag])).toEqual([
    ["2026-05-02", 1.9, "normal"],
    ["2026-11-06", 2.6, "high"],
  ]);
  expect(series.otherUnits).toBe(1);
  expect(series.unread).toBe(1);
});

test("results are ordered by date, then by report; limit values keep their printed text", () => {
  const series = labSeries([
    result("2026-11-06", "<0.5", "µg/dL", null, 14, 9),
    result("2026-05-02", "12", "µg/dL", null, 14, 4),
    result("2026-05-02", "11", "µg/dL", null, 14, 3),
  ]);
  expect(series.points.map((p) => [p.date, p.valueText, p.comparator])).toEqual([
    ["2026-05-02", "11", null],
    ["2026-05-02", "12", null],
    ["2026-11-06", "<0.5", "<"],
  ]);
});

test("the range band follows each result's own range and breaks where it isn't two-sided", () => {
  const band = rangeBand([
    { date: "2026-01-01", refLow: 0.6, refHigh: 2.4 },
    { date: "2026-03-01", refLow: 0.8, refHigh: 2.2 },
    { date: "2026-05-01", refLow: null, refHigh: 14 },
    { date: "2026-07-01", refLow: 3, refHigh: 1 },
  ]);
  expect(band.map((b) => b.low)).toEqual([0.6, 0.8, null, null]);
  expect(band[0]!.height).toBeCloseTo(1.8);
  expect(band[1]!.height).toBeCloseTo(1.4);
  expect(band.slice(2).map((b) => b.height)).toEqual([null, null]);
  expect(band[0]!.x).toBe(dateToUtc("2026-01-01"));
});

const pet = (petId: number, name: string, dob: string | null, results: LabResultInput[]) => ({
  petId,
  name,
  dob,
  results,
});

test("comparing pets plots the latest unit and names every pet left out", () => {
  const pets = [
    pet(1, "Miso", "2014-03-15", [result("2025-01-01", "1.6"), result("2026-11-06", "2.6")]),
    pet(2, "Reggie", "2020-06-01", [result("2025-03-01", "141", "µmol/L", 71, 212)]),
    pet(3, "Biscuit", null, [result("2026-10-01", "1.1")]),
    pet(4, "Pepper", "2005-05-05", [result("2021-01-01", "Negative", null, null, null)]),
  ];
  const byDate = compareSeries(pets, "date");
  expect(byDate.unit).toBe("mg/dL");
  expect(byDate.plotted.map((p) => [p.name, p.points.map((x) => x.x)])).toEqual([
    ["Miso", [dateToUtc("2025-01-01"), dateToUtc("2026-11-06")]],
    ["Biscuit", [dateToUtc("2026-10-01")]],
  ]);
  expect(byDate.leftOut).toEqual([
    { petId: 4, name: "Pepper", reason: "no-data" },
    { petId: 2, name: "Reggie", reason: "other-unit" },
  ]);

  const byAge = compareSeries(pets, "age");
  expect(byAge.plotted.map((p) => p.name)).toEqual(["Miso"]);
  expect(byAge.plotted[0]!.points[0]!.x).toBeCloseTo(ageInYears("2014-03-15", "2025-01-01")!);
  expect(byAge.leftOut.map((l) => [l.name, l.reason])).toEqual([
    ["Biscuit", "no-birth-date"],
    ["Pepper", "no-data"],
    ["Reggie", "other-unit"],
  ]);
});

test("the unit comes from pets that can be drawn, and pets with nothing placeable are named", () => {
  const pets = [
    pet(1, "Miso", "2014-03-15", [result("2025-01-01", "1.6")]),
    // Latest result overall, but no birth date: it must not decide the unit by age.
    pet(2, "Reggie", null, [result("2026-11-01", "141", "µmol/L", 71, 212)]),
    // Every result predates the recorded birth date.
    pet(3, "Biscuit", "2025-09-20", [result("2025-01-01", "1.1")]),
  ];
  const byAge = compareSeries(pets, "age");
  expect(byAge.unit).toBe("mg/dL");
  expect(byAge.plotted.map((p) => p.name)).toEqual(["Miso"]);
  expect(byAge.leftOut.map((l) => [l.name, l.reason])).toEqual([
    ["Biscuit", "before-birth"],
    ["Reggie", "no-birth-date"],
  ]);
  // By date the latest unit across everyone wins.
  expect(compareSeries(pets, "date").unit).toBe("µmol/L");
});

test("a plotted pet's results that can't be drawn are counted, never dropped silently", () => {
  const pets = [
    pet(1, "Miso", "2014-03-15", [
      result("2013-01-01", "1.0"),
      result("2025-01-01", "Negative", null, null, null),
      result("2025-06-01", "141", "µmol/L", 71, 212),
      result("2026-11-06", "2.6"),
    ]),
  ];
  const byDate = compareSeries(pets, "date");
  expect(byDate.plotted[0]).toMatchObject({ otherUnits: 1, unread: 1, beforeBirth: 0 });
  expect(byDate.plotted[0]!.points).toHaveLength(2);

  const byAge = compareSeries(pets, "age");
  expect(byAge.plotted[0]).toMatchObject({ otherUnits: 1, unread: 1, beforeBirth: 1 });
  expect(byAge.plotted[0]!.points).toHaveLength(1);
});

test("against age, a result before the birth date can't choose the unit", () => {
  const pets = [
    pet(1, "Miso", "2014-03-15", [result("2025-01-01", "1.6")]),
    // Newest result, in another unit, but dated before this pet's recorded birth.
    pet(2, "Biscuit", "2026-12-01", [result("2026-11-01", "141", "µmol/L", 71, 212)]),
  ];
  const byAge = compareSeries(pets, "age");
  expect(byAge.unit).toBe("mg/dL");
  expect(byAge.plotted.map((p) => p.name)).toEqual(["Miso"]);
  expect(byAge.leftOut.map((l) => [l.name, l.reason])).toEqual([["Biscuit", "before-birth"]]);
});
